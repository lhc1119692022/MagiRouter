package service

import (
	"context"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"

	"github.com/bytedance/gopkg/util/gopool"
)

const orderExpireTickInterval = 1 * time.Minute

var (
	orderExpireOnce    sync.Once
	orderExpireRunning atomic.Bool
)

func StartOrderExpireTask() {
	orderExpireOnce.Do(func() {
		if !common.IsMasterNode {
			return
		}
		gopool.Go(func() {
			logger.LogInfo(context.Background(), common.LogText("pending order expire task started: tick=%s", orderExpireTickInterval))
			ticker := time.NewTicker(orderExpireTickInterval)
			defer ticker.Stop()

			runOrderExpireOnce()
			for range ticker.C {
				runOrderExpireOnce()
			}
		})
	})
}

func runOrderExpireOnce() {
	if !orderExpireRunning.CompareAndSwap(false, true) {
		return
	}
	defer orderExpireRunning.Store(false)

	ctx := context.Background()
	now := time.Now()

	topUpExpired, err := model.ExpireOverduePendingTopUps(now)
	if err != nil {
		logger.LogWarn(ctx, common.LogText("pending top-up order expire task failed: %v", err))
	}

	subExpired, err := model.ExpireOverduePendingSubscriptionOrders(now)
	if err != nil {
		logger.LogWarn(ctx, common.LogText("pending subscription order expire task failed: %v", err))
	}

	if topUpExpired > 0 || subExpired > 0 {
		logger.LogInfo(ctx, common.LogText("expired overdue pending orders: topup_count=%d, subscription_count=%d", topUpExpired, subExpired))
	}
}
