package middleware

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/setting"

	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
)

const (
	userConcurrencySlotKeyPrefix  = "concurrency:user:"
	userConcurrencyWaitKeyPrefix  = "concurrency:wait:user:"
	userConcurrencyRedisOpTimeout = 3 * time.Second
)

var (
	userConcurrencyProcessPrefix = initUserConcurrencyProcessPrefix()
	userConcurrencyRequestSeq    atomic.Uint64
	inMemoryUserConcurrency      = newMemoryUserConcurrencyLimiter()
)

var (
	// redisUserConcurrencyAcquireScript atomically evicts expired slots using
	// Redis server TIME, checks the active slot count, and acquires a slot.
	redisUserConcurrencyAcquireScript = redis.NewScript(`
		if redis.replicate_commands then
			redis.replicate_commands()
		end
		local key = KEYS[1]
		local maxConcurrency = tonumber(ARGV[1])
		local ttl = tonumber(ARGV[2])
		local requestID = ARGV[3]
		local now = tonumber(redis.call('TIME')[1])
		local expireBefore = now - ttl
		redis.call('ZREMRANGEBYSCORE', key, '-inf', expireBefore)
		if redis.call('ZSCORE', key, requestID) ~= false then
			redis.call('ZADD', key, now, requestID)
			redis.call('EXPIRE', key, ttl + 60)
			return 1
		end
		local count = redis.call('ZCARD', key)
		if count < maxConcurrency then
			redis.call('ZADD', key, now, requestID)
			redis.call('EXPIRE', key, ttl + 60)
			return 1
		end
		return 0
	`)

	redisUserConcurrencyReleaseScript = redis.NewScript(`
		local key = KEYS[1]
		local requestID = ARGV[1]
		redis.call('ZREM', key, requestID)
		if redis.call('ZCARD', key) == 0 then
			redis.call('DEL', key)
		end
		return 1
	`)

	redisUserConcurrencyWaitEnterScript = redis.NewScript(`
		local key = KEYS[1]
		local maxWait = tonumber(ARGV[1])
		local ttl = tonumber(ARGV[2])
		local current = tonumber(redis.call('GET', key) or '0')
		if current >= maxWait then
			return 0
		end
		local nextVal = redis.call('INCR', key)
		redis.call('EXPIRE', key, ttl)
		if nextVal > maxWait then
			redis.call('DECR', key)
			return 0
		end
		return 1
	`)

	redisUserConcurrencyWaitLeaveScript = redis.NewScript(`
		local key = KEYS[1]
		local val = tonumber(redis.call('DECR', key))
		if val <= 0 then
			redis.call('DEL', key)
		end
		return 1
	`)
)

func initUserConcurrencyProcessPrefix() string {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err == nil {
		return "p" + strconv.FormatUint(binary.BigEndian.Uint64(buf), 36)
	}
	fallback := uint64(time.Now().UnixNano()) ^ (uint64(os.Getpid()) << 16)
	return "p" + strconv.FormatUint(fallback, 36)
}

func nextUserConcurrencyRequestID() string {
	seq := userConcurrencyRequestSeq.Add(1)
	return userConcurrencyProcessPrefix + "-" + strconv.FormatUint(seq, 36)
}

func userConcurrencySlotKey(userID int) string {
	return userConcurrencySlotKeyPrefix + strconv.Itoa(userID)
}

func userConcurrencyWaitKey(userID int) string {
	return userConcurrencyWaitKeyPrefix + strconv.Itoa(userID)
}

type memoryUserConcurrencyLimiter struct {
	mu      sync.Mutex
	slots   map[int]map[string]time.Time
	waiting map[int]int
	notify  map[int]chan struct{}
}

func newMemoryUserConcurrencyLimiter() *memoryUserConcurrencyLimiter {
	return &memoryUserConcurrencyLimiter{
		slots:   make(map[int]map[string]time.Time),
		waiting: make(map[int]int),
		notify:  make(map[int]chan struct{}),
	}
}

func (l *memoryUserConcurrencyLimiter) reset() {
	l.mu.Lock()
	defer l.mu.Unlock()
	for _, ch := range l.notify {
		close(ch)
	}
	l.slots = make(map[int]map[string]time.Time)
	l.waiting = make(map[int]int)
	l.notify = make(map[int]chan struct{})
}

func (l *memoryUserConcurrencyLimiter) evictExpiredLocked(userID int, ttl time.Duration, now time.Time) {
	userSlots := l.slots[userID]
	if len(userSlots) == 0 {
		return
	}
	evicted := false
	for reqID, acquiredAt := range userSlots {
		if now.Sub(acquiredAt) >= ttl {
			delete(userSlots, reqID)
			evicted = true
		}
	}
	if len(userSlots) == 0 {
		delete(l.slots, userID)
	}
	if evicted {
		l.broadcastLocked(userID)
	}
}

func (l *memoryUserConcurrencyLimiter) broadcastLocked(userID int) {
	if ch, ok := l.notify[userID]; ok {
		close(ch)
		delete(l.notify, userID)
	}
}

func (l *memoryUserConcurrencyLimiter) waitSignal(userID int) <-chan struct{} {
	l.mu.Lock()
	defer l.mu.Unlock()
	ch, ok := l.notify[userID]
	if !ok {
		ch = make(chan struct{})
		l.notify[userID] = ch
	}
	return ch
}

func (l *memoryUserConcurrencyLimiter) acquire(userID int, maxConcurrency int, ttl time.Duration, requestID string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	l.evictExpiredLocked(userID, ttl, now)
	userSlots := l.slots[userID]
	if _, exists := userSlots[requestID]; exists {
		userSlots[requestID] = now
		return true
	}
	if len(userSlots) >= maxConcurrency {
		return false
	}
	if userSlots == nil {
		userSlots = make(map[string]time.Time, maxConcurrency)
		l.slots[userID] = userSlots
	}
	userSlots[requestID] = now
	return true
}

func (l *memoryUserConcurrencyLimiter) release(userID int, requestID string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	userSlots := l.slots[userID]
	if userSlots == nil {
		return
	}
	if _, exists := userSlots[requestID]; !exists {
		return
	}
	delete(userSlots, requestID)
	if len(userSlots) == 0 {
		delete(l.slots, userID)
	}
	l.broadcastLocked(userID)
}

func (l *memoryUserConcurrencyLimiter) enterWait(userID int, maxWait int) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.waiting[userID] >= maxWait {
		return false
	}
	l.waiting[userID]++
	return true
}

func (l *memoryUserConcurrencyLimiter) leaveWait(userID int) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.waiting[userID] <= 1 {
		delete(l.waiting, userID)
		return
	}
	l.waiting[userID]--
}

func (l *memoryUserConcurrencyLimiter) activeCount(userID int) int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.slots[userID])
}

func acquireUserConcurrencySlot(ctx context.Context, userID int, maxConcurrency int, slotTTLSeconds int, requestID string) (bool, bool) {
	if !common.RedisEnabled || common.RDB == nil {
		acquired := inMemoryUserConcurrency.acquire(userID, maxConcurrency, time.Duration(slotTTLSeconds)*time.Second, requestID)
		return acquired, false
	}
	opCtx, cancel := context.WithTimeout(ctx, userConcurrencyRedisOpTimeout)
	defer cancel()
	result, err := redisUserConcurrencyAcquireScript.Run(
		opCtx,
		common.RDB,
		[]string{userConcurrencySlotKey(userID)},
		maxConcurrency,
		slotTTLSeconds,
		requestID,
	).Int()
	if err != nil {
		common.SysLog(fmt.Sprintf("user concurrency acquire redis fallback (fail-open) for user %d: %v", userID, err))
		return true, true
	}
	return result == 1, false
}

func releaseUserConcurrencySlot(userID int, requestID string) {
	if !common.RedisEnabled || common.RDB == nil {
		inMemoryUserConcurrency.release(userID, requestID)
		return
	}
	opCtx, cancel := context.WithTimeout(context.Background(), userConcurrencyRedisOpTimeout)
	defer cancel()
	if err := redisUserConcurrencyReleaseScript.Run(
		opCtx,
		common.RDB,
		[]string{userConcurrencySlotKey(userID)},
		requestID,
	).Err(); err != nil {
		common.SysLog(fmt.Sprintf("user concurrency release redis error for user %d (req=%s): %v", userID, requestID, err))
	}
}

func enterUserConcurrencyWait(ctx context.Context, userID int, maxWait int, waitTimeout time.Duration) (bool, bool) {
	if maxWait <= 0 {
		return false, false
	}
	if !common.RedisEnabled || common.RDB == nil {
		return inMemoryUserConcurrency.enterWait(userID, maxWait), false
	}
	ttlSeconds := max(int(waitTimeout.Seconds())+30, 60)
	opCtx, cancel := context.WithTimeout(ctx, userConcurrencyRedisOpTimeout)
	defer cancel()
	result, err := redisUserConcurrencyWaitEnterScript.Run(
		opCtx,
		common.RDB,
		[]string{userConcurrencyWaitKey(userID)},
		maxWait,
		ttlSeconds,
	).Int()
	if err != nil {
		common.SysLog(fmt.Sprintf("user concurrency wait enter redis fallback (fail-open) for user %d: %v", userID, err))
		return true, true
	}
	return result == 1, false
}

func leaveUserConcurrencyWait(userID int) {
	if !common.RedisEnabled || common.RDB == nil {
		inMemoryUserConcurrency.leaveWait(userID)
		return
	}
	opCtx, cancel := context.WithTimeout(context.Background(), userConcurrencyRedisOpTimeout)
	defer cancel()
	if err := redisUserConcurrencyWaitLeaveScript.Run(
		opCtx,
		common.RDB,
		[]string{userConcurrencyWaitKey(userID)},
	).Err(); err != nil {
		common.SysLog(fmt.Sprintf("user concurrency wait leave redis error for user %d: %v", userID, err))
	}
}

func resolveRequestUserConcurrencyLimit(c *gin.Context) int {
	userMax := common.GetContextKeyInt(c, constant.ContextKeyUserMaxConcurrency)
	tokenGroup := common.GetContextKeyString(c, constant.ContextKeyTokenGroup)
	userGroup := common.GetContextKeyString(c, constant.ContextKeyUserGroup)
	return setting.ResolveUserConcurrencyLimit(userMax, tokenGroup, userGroup)
}

// UserConcurrencyLimit bounds the number of simultaneous in-flight model
// requests per user, with optional bounded queuing before returning HTTP 429.
func UserConcurrencyLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !setting.IsUserConcurrencyLimitEnabled() {
			c.Next()
			return
		}

		userID := c.GetInt("id")
		if userID <= 0 {
			c.Next()
			return
		}

		maxConcurrency := resolveRequestUserConcurrencyLimit(c)
		if maxConcurrency <= 0 {
			c.Next()
			return
		}

		slotTTLSeconds := setting.GetUserConcurrencyLimitSlotTTLSeconds()
		requestID := nextUserConcurrencyRequestID()

		acquired, failOpen := acquireUserConcurrencySlot(c.Request.Context(), userID, maxConcurrency, slotTTLSeconds, requestID)
		if acquired {
			if !failOpen {
				defer releaseUserConcurrencySlot(userID, requestID)
			}
			c.Next()
			return
		}

		waitTimeout := setting.GetUserConcurrencyLimitWaitTimeout()
		if waitTimeout <= 0 {
			abortWithOpenAiMessage(c, http.StatusTooManyRequests, i18n.T(c, i18n.MsgConcurrencyLimitReached, map[string]any{"Max": maxConcurrency}))
			return
		}

		maxWait := maxConcurrency + setting.GetUserConcurrencyLimitMaxWaitExtra()
		entered, waitFailOpen := enterUserConcurrencyWait(c.Request.Context(), userID, maxWait, waitTimeout)
		if !entered {
			abortWithOpenAiMessage(c, http.StatusTooManyRequests, i18n.T(c, i18n.MsgConcurrencyQueueFull, map[string]any{"Max": maxConcurrency}))
			return
		}

		var leaveOnce sync.Once
		leaveWait := func() {
			if waitFailOpen {
				return
			}
			leaveOnce.Do(func() {
				leaveUserConcurrencyWait(userID)
			})
		}
		defer leaveWait()

		deadlineTimer := time.NewTimer(waitTimeout)
		defer deadlineTimer.Stop()

		pollInterval := 50 * time.Millisecond
		for {
			var memSignal <-chan struct{}
			if !common.RedisEnabled || common.RDB == nil {
				memSignal = inMemoryUserConcurrency.waitSignal(userID)
			}

			acquired, failOpen = acquireUserConcurrencySlot(c.Request.Context(), userID, maxConcurrency, slotTTLSeconds, requestID)
			if acquired {
				leaveWait()
				if !failOpen {
					defer releaseUserConcurrencySlot(userID, requestID)
				}
				c.Next()
				return
			}

			if memSignal != nil {
				select {
				case <-c.Request.Context().Done():
					c.Abort()
					return
				case <-deadlineTimer.C:
					abortWithOpenAiMessage(c, http.StatusTooManyRequests, i18n.T(c, i18n.MsgConcurrencyWaitTimeout, map[string]any{
						"Max":     maxConcurrency,
						"Seconds": int(waitTimeout.Seconds()),
					}))
					return
				case <-memSignal:
				}
				continue
			}

			pollTimer := time.NewTimer(pollInterval)
			select {
			case <-c.Request.Context().Done():
				pollTimer.Stop()
				c.Abort()
				return
			case <-deadlineTimer.C:
				pollTimer.Stop()
				abortWithOpenAiMessage(c, http.StatusTooManyRequests, i18n.T(c, i18n.MsgConcurrencyWaitTimeout, map[string]any{
					"Max":     maxConcurrency,
					"Seconds": int(waitTimeout.Seconds()),
				}))
				return
			case <-pollTimer.C:
			}
			if pollInterval < 200*time.Millisecond {
				pollInterval += 50 * time.Millisecond
			}
		}
	}
}
