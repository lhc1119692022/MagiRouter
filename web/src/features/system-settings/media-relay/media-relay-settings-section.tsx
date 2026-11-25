/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowUpDown,
  CheckCircle2,
  Cloud,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  UserPlus,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatNumber } from '@/lib/format'
import { getServerErrorMessage } from '@/lib/server-error-message'

import {
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import {
  deleteMediaTrafficOverride,
  getAdminUserMediaTraffic,
  getMediaRelayConfig,
  listMediaTrafficOverrides,
  resetUserMediaDailyTraffic,
  searchUsersForMediaRelay,
  testMediaRelayConfig,
  updateMediaRelayConfig,
  upsertMediaTrafficOverride,
} from './api'
import type {
  AdminUserMediaTrafficData,
  MediaRelayConfigUpdatePayload,
  MediaRelayConnectivityResult,
  MediaRelayProvider,
  MediaTrafficOverrideItem,
  UserSearchOption,
} from './types'

interface GroupBonusRow {
  id: string
  group: string
  bonusMB: string
}

const BYTES_PER_MIB = 1024 * 1024
const ALIYUN_HK_ENDPOINT = 'https://oss-cn-hongkong.aliyuncs.com'
const ALIYUN_HK_REGION = 'oss-cn-hongkong'

function formatBytesLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < BYTES_PER_MIB) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * BYTES_PER_MIB) {
    return `${(bytes / BYTES_PER_MIB).toFixed(1)} MB`
  }
  return `${(bytes / (1024 * BYTES_PER_MIB)).toFixed(2)} GB`
}

function unixSecondsToDateTimeLocal(unixSeconds: number): string {
  if (!unixSeconds || unixSeconds <= 0) return ''
  const date = new Date(unixSeconds * 1000)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function dateTimeLocalToUnixSeconds(value: string): number {
  const trimmed = value.trim()
  if (!trimmed) return 0
  const parsed = Date.parse(trimmed)
  if (Number.isNaN(parsed) || parsed <= 0) return 0
  return Math.floor(parsed / 1000)
}

function futureDateTimeLocal(hoursFromNow: number): string {
  return unixSecondsToDateTimeLocal(
    Math.floor(Date.now() / 1000) + hoursFromNow * 3600
  )
}

function formatUnixTimestamp(unixSeconds: number): string {
  if (!unixSeconds || unixSeconds <= 0) return ''
  const date = new Date(unixSeconds * 1000)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function MediaRelaySettingsSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const configQuery = useQuery({
    queryKey: ['media-relay-config'],
    queryFn: getMediaRelayConfig,
  })

  const [overrideFilter, setOverrideFilter] = useState('')
  const overridesQuery = useQuery({
    queryKey: ['media-relay-overrides', overrideFilter],
    queryFn: () => listMediaTrafficOverrides(overrideFilter),
  })

  const [enabled, setEnabled] = useState(false)
  const [provider, setProvider] = useState<MediaRelayProvider>('aliyun-oss')
  const [endpoint, setEndpoint] = useState(ALIYUN_HK_ENDPOINT)
  const [region, setRegion] = useState(ALIYUN_HK_REGION)
  const [bucket, setBucket] = useState('')
  const [publicBaseURL, setPublicBaseURL] = useState('')
  const [keyPrefix, setKeyPrefix] = useState('magicanva/media')
  const [accessKeyId, setAccessKeyId] = useState('')
  const [accessKeySecret, setAccessKeySecret] = useState('')
  const [forcePathStyle, setForcePathStyle] = useState(false)
  const [presignTTLSeconds, setPresignTTLSeconds] = useState('600')
  const [retentionDays, setRetentionDays] = useState('3')
  const [maxFileSizeMB, setMaxFileSizeMB] = useState('200')
  const [defaultDailyTrafficMB, setDefaultDailyTrafficMB] = useState('500')
  const [groupBonusRows, setGroupBonusRows] = useState<GroupBonusRow[]>([])
  const [tempGlobalBonusMB, setTempGlobalBonusMB] = useState('0')
  const [tempGlobalExpiresInput, setTempGlobalExpiresInput] = useState('')
  const [tempGlobalNote, setTempGlobalNote] = useState('')
  const [testResult, setTestResult] =
    useState<MediaRelayConnectivityResult | null>(null)

  const [userKeyword, setUserKeyword] = useState('')
  const [userResults, setUserResults] = useState<UserSearchOption[]>([])
  const [searchingUsers, setSearchingUsers] = useState(false)
  const [targetUserId, setTargetUserId] = useState('')
  const [inspectedUser, setInspectedUser] =
    useState<AdminUserMediaTrafficData | null>(null)
  const [inspectingUser, setInspectingUser] = useState(false)
  const [overrideBonusMB, setOverrideBonusMB] = useState('500')
  const [overrideExpiresInput, setOverrideExpiresInput] = useState('')
  const [overrideNote, setOverrideNote] = useState('')

  useEffect(() => {
    const data = configQuery.data
    if (!data) return
    setEnabled(data.enabled)
    setProvider(data.provider || 'aliyun-oss')
    setEndpoint(data.endpoint || ALIYUN_HK_ENDPOINT)
    setRegion(data.region || ALIYUN_HK_REGION)
    setBucket(data.bucket || '')
    setPublicBaseURL(data.public_base_url || '')
    setKeyPrefix(data.key_prefix || 'magicanva/media')
    setAccessKeyId(data.access_key_id || '')
    setAccessKeySecret('')
    setForcePathStyle(Boolean(data.force_path_style))
    setPresignTTLSeconds(String(data.presign_ttl_seconds || 600))
    setRetentionDays(String(data.retention_days || 3))
    setMaxFileSizeMB(String(data.max_file_size_mb || 200))
    setDefaultDailyTrafficMB(String(data.default_daily_traffic_mb ?? 500))
    setGroupBonusRows(
      Object.entries(data.group_daily_bonus_mb || {}).map(
        ([group, bonus], index) => ({
          id: `grp-${index}-${group}`,
          group,
          bonusMB: String(bonus),
        })
      )
    )
    setTempGlobalBonusMB(String(data.temp_global_bonus_mb || 0))
    setTempGlobalExpiresInput(
      unixSecondsToDateTimeLocal(data.temp_global_expires_at)
    )
    setTempGlobalNote(data.temp_global_note || '')
  }, [configQuery.data])

  const buildConfigPayload = (): MediaRelayConfigUpdatePayload => {
    const groupMap: Record<string, number> = {}
    for (const row of groupBonusRows) {
      const trimmedGroup = row.group.trim()
      const parsedBonus = Number.parseInt(row.bonusMB.trim(), 10)
      if (trimmedGroup && Number.isFinite(parsedBonus) && parsedBonus > 0) {
        groupMap[trimmedGroup] = parsedBonus
      }
    }
    return {
      enabled,
      provider,
      endpoint: endpoint.trim().replace(/\/+$/, ''),
      region: region.trim(),
      bucket: bucket.trim(),
      public_base_url: publicBaseURL.trim().replace(/\/+$/, ''),
      key_prefix: keyPrefix.trim().replaceAll(/^\/+|\/+$/g, ''),
      access_key_id: accessKeyId.trim(),
      access_key_secret: accessKeySecret.trim(),
      force_path_style: provider === 's3' ? forcePathStyle : false,
      presign_ttl_seconds: Number.parseInt(presignTTLSeconds, 10) || 600,
      retention_days: Number.parseInt(retentionDays, 10) || 3,
      max_file_size_mb: Number.parseInt(maxFileSizeMB, 10) || 200,
      default_daily_traffic_mb: Math.max(
        0,
        Number.parseInt(defaultDailyTrafficMB, 10) || 0
      ),
      group_daily_bonus_mb: groupMap,
      temp_global_bonus_mb: Math.max(
        0,
        Number.parseInt(tempGlobalBonusMB, 10) || 0
      ),
      temp_global_expires_at: dateTimeLocalToUnixSeconds(
        tempGlobalExpiresInput
      ),
      temp_global_note: tempGlobalNote.trim(),
    }
  }

  const saveMutation = useMutation({
    mutationFn: () => updateMediaRelayConfig(buildConfigPayload()),
    onSuccess: (updated) => {
      queryClient.setQueryData(['media-relay-config'], updated)
      void queryClient.invalidateQueries({
        queryKey: ['media-relay-overrides'],
      })
      setAccessKeySecret('')
      toast.success(t('Canvas media relay settings saved'))
    },
    onError: (err) => {
      toast.error(
        getServerErrorMessage(err, t('Failed to save canvas media settings'))
      )
    },
  })

  const testMutation = useMutation({
    mutationFn: () => testMediaRelayConfig(buildConfigPayload()),
    onSuccess: (result) => {
      setTestResult(result)
      if (result.reachable) {
        toast.success(t('Bucket connection test succeeded'))
      } else {
        toast.error(result.diagnostic || t('Bucket connection test failed'))
      }
    },
    onError: (err) => {
      toast.error(
        getServerErrorMessage(err, t('Bucket connection test failed'))
      )
    },
  })

  const upsertOverrideMutation = useMutation({
    mutationFn: async () => {
      const parsedUserId = Number.parseInt(targetUserId.trim(), 10)
      const parsedBonusMB = Number.parseInt(overrideBonusMB.trim(), 10)
      if (!Number.isFinite(parsedUserId) || parsedUserId <= 0) {
        throw new Error(t('Enter a valid user ID'))
      }
      if (!Number.isFinite(parsedBonusMB) || parsedBonusMB <= 0) {
        throw new Error(t('Enter a positive daily traffic bonus (MB)'))
      }
      return upsertMediaTrafficOverride(parsedUserId, {
        extra_daily_mb: parsedBonusMB,
        expires_at: dateTimeLocalToUnixSeconds(overrideExpiresInput),
        note: overrideNote.trim(),
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['media-relay-overrides'],
      })
      const parsedUserId = Number.parseInt(targetUserId.trim(), 10)
      if (Number.isFinite(parsedUserId) && parsedUserId > 0) {
        void handleInspectUser(parsedUserId)
      }
      toast.success(t('Targeted daily traffic boost saved'))
    },
    onError: (err) => {
      toast.error(
        getServerErrorMessage(err, t('Failed to save targeted traffic boost'))
      )
    },
  })

  const deleteOverrideMutation = useMutation({
    mutationFn: (userId: number) => deleteMediaTrafficOverride(userId),
    onSuccess: (_data, userId) => {
      void queryClient.invalidateQueries({
        queryKey: ['media-relay-overrides'],
      })
      if (inspectedUser?.user.id === userId) {
        void handleInspectUser(userId)
      }
      toast.success(t('Targeted daily traffic boost removed'))
    },
    onError: (err) => {
      toast.error(
        getServerErrorMessage(err, t('Failed to remove targeted traffic boost'))
      )
    },
  })

  const resetUsageMutation = useMutation({
    mutationFn: (userId: number) => resetUserMediaDailyTraffic(userId),
    onSuccess: (_data, userId) => {
      void queryClient.invalidateQueries({
        queryKey: ['media-relay-overrides'],
      })
      if (inspectedUser?.user.id === userId) {
        void handleInspectUser(userId)
      }
      toast.success(t("User's daily media traffic has been reset to 0"))
    },
    onError: (err) => {
      toast.error(
        getServerErrorMessage(err, t('Failed to reset user daily traffic'))
      )
    },
  })

  const handleSearchUsers = async () => {
    const trimmed = userKeyword.trim()
    if (!trimmed) {
      setUserResults([])
      return
    }
    setSearchingUsers(true)
    try {
      const results = await searchUsersForMediaRelay(trimmed)
      setUserResults(results)
    } catch (err) {
      toast.error(getServerErrorMessage(err, t('Failed to search users')))
    } finally {
      setSearchingUsers(false)
    }
  }

  const handleInspectUser = async (userId: number) => {
    setInspectingUser(true)
    try {
      const data = await getAdminUserMediaTraffic(userId)
      setInspectedUser(data)
      setTargetUserId(String(data.user.id))
    } catch (err) {
      toast.error(
        getServerErrorMessage(err, t('Failed to load user media traffic'))
      )
    } finally {
      setInspectingUser(false)
    }
  }

  const handleSelectOverrideForEdit = (item: MediaTrafficOverrideItem) => {
    setTargetUserId(String(item.user_id))
    setOverrideBonusMB(String(item.extra_daily_mb || 0))
    setOverrideExpiresInput(unixSecondsToDateTimeLocal(item.expires_at))
    setOverrideNote(item.note || '')
    void handleInspectUser(item.user_id)
  }

  const applyAliyunHongKongPreset = () => {
    setProvider('aliyun-oss')
    setEndpoint(ALIYUN_HK_ENDPOINT)
    setRegion(ALIYUN_HK_REGION)
    setForcePathStyle(false)
    if (!keyPrefix.trim()) {
      setKeyPrefix('magicanva/media')
    }
    toast.success(t('Applied Aliyun OSS China (Hong Kong) preset'))
  }

  const effectiveDefaultPreviewMB = useMemo(() => {
    const base = Math.max(0, Number.parseInt(defaultDailyTrafficMB, 10) || 0)
    const tempBonus = Math.max(0, Number.parseInt(tempGlobalBonusMB, 10) || 0)
    const expiresAt = dateTimeLocalToUnixSeconds(tempGlobalExpiresInput)
    const isTempActive =
      tempBonus > 0 && (expiresAt === 0 || expiresAt > Date.now() / 1000)
    return base + (isTempActive ? tempBonus : 0)
  }, [defaultDailyTrafficMB, tempGlobalBonusMB, tempGlobalExpiresInput])

  const overrides = overridesQuery.data?.items ?? []

  return (
    <SettingsSection title={t('Canvas Media & Traffic')}>
      <SettingsPageFormActions
        onSave={() => saveMutation.mutate()}
        isSaving={saveMutation.isPending}
        saveLabel='Save media relay settings'
      />

      <div className='flex flex-col gap-6'>
        <Card>
          <CardHeader className='flex flex-row flex-wrap items-start justify-between gap-3'>
            <div className='space-y-1'>
              <CardTitle className='flex items-center gap-2 text-base'>
                <Cloud className='text-muted-foreground h-4 w-4' />
                <span>{t('Object Storage Bucket (Aliyun OSS Hong Kong)')}</span>
                {configQuery.data?.is_ready ? (
                  <Badge variant='secondary'>{t('Enabled')}</Badge>
                ) : (
                  <Badge variant='outline'>{t('Not configured')}</Badge>
                )}
              </CardTitle>
              <CardDescription>
                {t(
                  'Browsers upload canvas reference media directly to OSS via short-lived presigned URLs without consuming VPS bandwidth or disk.'
                )}
              </CardDescription>
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={applyAliyunHongKongPreset}
              >
                {t('Aliyun OSS Hong Kong Preset')}
              </Button>
              <Button
                type='button'
                variant='outline'
                size='sm'
                disabled={testMutation.isPending}
                onClick={() => testMutation.mutate()}
              >
                {testMutation.isPending ? (
                  <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
                ) : (
                  <RefreshCw className='mr-1.5 h-3.5 w-3.5' />
                )}
                {t('Test Connection')}
              </Button>
            </div>
          </CardHeader>

          <CardContent className='space-y-5'>
            <SettingsSwitchItem>
              <SettingsSwitchContent>
                <Label htmlFor='media-relay-enabled'>
                  {t('Enable canvas cloud media relay')}
                </Label>
                <p className='text-muted-foreground text-xs'>
                  {t(
                    'Allow MagiCanva users to request presigned uploads using their MagiRouter API key.'
                  )}
                </p>
              </SettingsSwitchContent>
              <Switch
                id='media-relay-enabled'
                checked={enabled}
                onCheckedChange={setEnabled}
              />
            </SettingsSwitchItem>

            <div className='grid gap-4 md:grid-cols-2'>
              <div className='space-y-2'>
                <Label htmlFor='media-relay-provider'>
                  {t('Storage Driver')}
                </Label>
                <NativeSelect
                  id='media-relay-provider'
                  value={provider}
                  onChange={(event) =>
                    setProvider(event.target.value as MediaRelayProvider)
                  }
                >
                  <NativeSelectOption value='aliyun-oss'>
                    {t('Aliyun OSS (China Hong Kong default)')}
                  </NativeSelectOption>
                  <NativeSelectOption value='s3'>
                    {t('S3 Compatible (Tencent COS / R2 / MinIO)')}
                  </NativeSelectOption>
                </NativeSelect>
              </div>

              <div className='space-y-2'>
                <Label htmlFor='media-relay-bucket'>{t('Bucket Name')}</Label>
                <Input
                  id='media-relay-bucket'
                  value={bucket}
                  onChange={(event) => setBucket(event.target.value)}
                  placeholder='magirouter-media-hk'
                  autoComplete='off'
                />
              </div>

              <div className='space-y-2'>
                <Label htmlFor='media-relay-endpoint'>
                  {t('Storage Endpoint')}
                </Label>
                <Input
                  id='media-relay-endpoint'
                  value={endpoint}
                  onChange={(event) => setEndpoint(event.target.value)}
                  placeholder={ALIYUN_HK_ENDPOINT}
                  autoComplete='off'
                />
              </div>

              <div className='space-y-2'>
                <Label htmlFor='media-relay-region'>{t('Region')}</Label>
                <Input
                  id='media-relay-region'
                  value={region}
                  onChange={(event) => setRegion(event.target.value)}
                  placeholder={ALIYUN_HK_REGION}
                  autoComplete='off'
                />
              </div>

              <div className='space-y-2'>
                <Label htmlFor='media-relay-public-base'>
                  {t('Public Base URL (Recommended Custom Domain)')}
                </Label>
                <Input
                  id='media-relay-public-base'
                  value={publicBaseURL}
                  onChange={(event) => setPublicBaseURL(event.target.value)}
                  placeholder='https://media-hk.magirouter.com'
                  autoComplete='off'
                />
                <p className='text-muted-foreground text-xs'>
                  {t(
                    'Bind a custom HTTPS domain to your Hong Kong OSS bucket so media loads inline without forced download headers.'
                  )}
                </p>
              </div>

              <div className='space-y-2'>
                <Label htmlFor='media-relay-prefix'>
                  {t('Object Key Prefix')}
                </Label>
                <Input
                  id='media-relay-prefix'
                  value={keyPrefix}
                  onChange={(event) => setKeyPrefix(event.target.value)}
                  placeholder='magicanva/media'
                  autoComplete='off'
                />
              </div>

              <div className='space-y-2'>
                <Label htmlFor='media-relay-ak'>{t('AccessKey ID')}</Label>
                <Input
                  id='media-relay-ak'
                  value={accessKeyId}
                  onChange={(event) => setAccessKeyId(event.target.value)}
                  placeholder='LTAI5t...'
                  autoComplete='off'
                />
              </div>

              <div className='space-y-2'>
                <div className='flex items-center justify-between gap-2'>
                  <Label htmlFor='media-relay-sk'>
                    {t('AccessKey Secret')}
                  </Label>
                  {configQuery.data?.access_key_secret_configured ? (
                    <Badge variant='secondary'>{t('Configured')}</Badge>
                  ) : null}
                </div>
                <Input
                  id='media-relay-sk'
                  type='password'
                  value={accessKeySecret}
                  onChange={(event) => setAccessKeySecret(event.target.value)}
                  placeholder={
                    configQuery.data?.access_key_secret_configured
                      ? t('Leave blank to keep existing secret')
                      : t('Enter AccessKey Secret')
                  }
                  autoComplete='new-password'
                />
              </div>
            </div>

            <div className='grid gap-4 md:grid-cols-3'>
              <div className='space-y-2'>
                <Label htmlFor='media-relay-max-file'>
                  {t('Max Single File Size (MB)')}
                </Label>
                <Input
                  id='media-relay-max-file'
                  type='number'
                  min={1}
                  max={2048}
                  value={maxFileSizeMB}
                  onChange={(event) => setMaxFileSizeMB(event.target.value)}
                />
              </div>

              <div className='space-y-2'>
                <Label htmlFor='media-relay-retention'>
                  {t('Temp File Retention Hint (Days)')}
                </Label>
                <Input
                  id='media-relay-retention'
                  type='number'
                  min={1}
                  max={365}
                  value={retentionDays}
                  onChange={(event) => setRetentionDays(event.target.value)}
                />
              </div>

              <div className='space-y-2'>
                <Label htmlFor='media-relay-ttl'>
                  {t('Presigned Upload TTL (Seconds)')}
                </Label>
                <Input
                  id='media-relay-ttl'
                  type='number'
                  min={60}
                  max={3600}
                  value={presignTTLSeconds}
                  onChange={(event) => setPresignTTLSeconds(event.target.value)}
                />
              </div>
            </div>

            {provider === 's3' ? (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <Label htmlFor='media-relay-path-style'>
                    {t('Use S3 Path-Style URLs')}
                  </Label>
                  <p className='text-muted-foreground text-xs'>
                    {t(
                      'Enable for self-hosted MinIO or endpoints that do not support virtual-hosted bucket subdomains.'
                    )}
                  </p>
                </SettingsSwitchContent>
                <Switch
                  id='media-relay-path-style'
                  checked={forcePathStyle}
                  onCheckedChange={setForcePathStyle}
                />
              </SettingsSwitchItem>
            ) : null}

            {testResult ? (
              <div className='border-border bg-muted/40 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3.5 py-2.5 text-xs'>
                <div className='flex items-center gap-2'>
                  {testResult.reachable ? (
                    <CheckCircle2 className='h-4 w-4 text-emerald-600' />
                  ) : (
                    <XCircle className='text-destructive h-4 w-4' />
                  )}
                  <span className='font-medium'>{testResult.diagnostic}</span>
                </div>
                <span className='text-muted-foreground font-mono'>
                  HTTP {testResult.status_code || '-'} · {testResult.latency_ms}
                  ms
                </span>
              </div>
            ) : null}

            <div className='border-border/80 bg-muted/30 text-muted-foreground space-y-1 rounded-lg border px-3.5 py-3 text-xs'>
              <p className='text-foreground font-medium'>
                {t('Aliyun OSS China (Hong Kong) Bucket Checklist')}
              </p>
              <p>
                {t(
                  '1. CORS: allow your MagiCanva origin with methods PUT, GET, HEAD and header Content-Type.'
                )}
              </p>
              <p>
                {t(
                  '2. Lifecycle: add an auto-expiration rule on the object prefix (e.g. 3 days) to clean temporary relay files automatically.'
                )}
              </p>
              <p>
                {t(
                  '3. Storage class: use Standard (LRS) only; do not enable Infrequent Access or Transfer Acceleration.'
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <ArrowUpDown className='text-muted-foreground h-4 w-4' />
              <span>
                {t('Daily Transfer Traffic & Temporary Global Boost')}
              </span>
            </CardTitle>
            <CardDescription>
              {t(
                'Quotas below represent daily cloud transfer traffic (MB/day, reset at 00:00 Asia/Shanghai), not permanent cloud storage space.'
              )}
            </CardDescription>
          </CardHeader>

          <CardContent className='space-y-6'>
            <div className='grid gap-4 md:grid-cols-2'>
              <div className='space-y-2'>
                <Label htmlFor='media-default-daily-mb'>
                  {t('Default Daily Transfer Traffic (MB/day)')}
                </Label>
                <Input
                  id='media-default-daily-mb'
                  type='number'
                  min={0}
                  max={1048576}
                  value={defaultDailyTrafficMB}
                  onChange={(event) =>
                    setDefaultDailyTrafficMB(event.target.value)
                  }
                />
                <p className='text-muted-foreground text-xs'>
                  {t(
                    'Base daily upload quota for standard users (default 500 MB/day).'
                  )}
                </p>
              </div>

              <div className='border-border bg-muted/30 flex flex-col justify-center rounded-lg border px-4 py-3 text-xs'>
                <span className='text-muted-foreground'>
                  {t('Current Effective Default Daily Traffic')}
                </span>
                <span className='text-foreground mt-1 font-mono text-base font-semibold'>
                  {formatNumber(effectiveDefaultPreviewMB)} MB / {t('day')}
                </span>
                <span className='text-muted-foreground mt-0.5'>
                  {t(
                    'Formula: Base + Group Bonus + Active Global Boost + Targeted User Boost'
                  )}
                </span>
              </div>
            </div>

            <div className='border-border space-y-3 rounded-lg border p-4'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div>
                  <h4 className='text-sm font-medium'>
                    {t('Temporary Global Traffic Boost')}
                  </h4>
                  <p className='text-muted-foreground text-xs'>
                    {t(
                      'Temporarily add daily transfer traffic for all users during campaigns or traffic spikes; reverts automatically after expiration.'
                    )}
                  </p>
                </div>
                {(configQuery.data?.active_global_temp_bonus_mb ?? 0) > 0 ? (
                  <Badge variant='secondary'>
                    +{configQuery.data?.active_global_temp_bonus_mb} MB/
                    {t('day')}
                  </Badge>
                ) : null}
              </div>

              <div className='grid gap-4 md:grid-cols-3'>
                <div className='space-y-2'>
                  <Label htmlFor='media-temp-global-mb'>
                    {t('Global Bonus (+MB/day)')}
                  </Label>
                  <Input
                    id='media-temp-global-mb'
                    type='number'
                    min={0}
                    max={1048576}
                    value={tempGlobalBonusMB}
                    onChange={(event) =>
                      setTempGlobalBonusMB(event.target.value)
                    }
                  />
                </div>

                <div className='space-y-2'>
                  <Label htmlFor='media-temp-global-exp'>
                    {t('Expires At (Optional)')}
                  </Label>
                  <Input
                    id='media-temp-global-exp'
                    type='datetime-local'
                    value={tempGlobalExpiresInput}
                    onChange={(event) =>
                      setTempGlobalExpiresInput(event.target.value)
                    }
                  />
                </div>

                <div className='space-y-2'>
                  <Label htmlFor='media-temp-global-note'>{t('Note')}</Label>
                  <Input
                    id='media-temp-global-note'
                    value={tempGlobalNote}
                    onChange={(event) => setTempGlobalNote(event.target.value)}
                    placeholder={t('e.g. Weekend event +300 MB/day')}
                  />
                </div>
              </div>

              <div className='flex flex-wrap items-center gap-2'>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() =>
                    setTempGlobalExpiresInput(futureDateTimeLocal(24))
                  }
                >
                  {t('+24 Hours')}
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() =>
                    setTempGlobalExpiresInput(futureDateTimeLocal(72))
                  }
                >
                  {t('+3 Days')}
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() =>
                    setTempGlobalExpiresInput(futureDateTimeLocal(168))
                  }
                >
                  {t('+7 Days')}
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => setTempGlobalExpiresInput('')}
                >
                  {t('No Expiration')}
                </Button>
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  onClick={() => {
                    setTempGlobalBonusMB('0')
                    setTempGlobalExpiresInput('')
                    setTempGlobalNote('')
                  }}
                >
                  {t('Clear Boost')}
                </Button>
              </div>
            </div>

            <div className='border-border space-y-3 rounded-lg border p-4'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div>
                  <h4 className='text-sm font-medium'>
                    {t('Per-Group Daily Traffic Bonus')}
                  </h4>
                  <p className='text-muted-foreground text-xs'>
                    {t(
                      'Automatically grant extra daily transfer traffic to VIP or subscription user groups.'
                    )}
                  </p>
                </div>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() =>
                    setGroupBonusRows((prev) => [
                      ...prev,
                      {
                        id: `grp-${Date.now()}-${prev.length}`,
                        group: '',
                        bonusMB: '800',
                      },
                    ])
                  }
                >
                  <Plus className='mr-1 h-3.5 w-3.5' />
                  {t('Add Group Rule')}
                </Button>
              </div>

              {groupBonusRows.length === 0 ? (
                <p className='text-muted-foreground text-xs'>
                  {t(
                    'No group traffic bonuses configured. All groups share the default daily traffic.'
                  )}
                </p>
              ) : (
                <div className='space-y-2'>
                  {groupBonusRows.map((row) => (
                    <div
                      key={row.id}
                      className='grid grid-cols-[1fr_160px_auto] items-center gap-2'
                    >
                      <Input
                        value={row.group}
                        onChange={(event) =>
                          setGroupBonusRows((prev) =>
                            prev.map((item) =>
                              item.id === row.id
                                ? { ...item, group: event.target.value }
                                : item
                            )
                          )
                        }
                        placeholder={t('Group name (e.g. vip)')}
                      />
                      <Input
                        type='number'
                        min={1}
                        max={1048576}
                        value={row.bonusMB}
                        onChange={(event) =>
                          setGroupBonusRows((prev) =>
                            prev.map((item) =>
                              item.id === row.id
                                ? { ...item, bonusMB: event.target.value }
                                : item
                            )
                          )
                        }
                        placeholder='+MB/day'
                      />
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        aria-label={t('Remove')}
                        onClick={() =>
                          setGroupBonusRows((prev) =>
                            prev.filter((item) => item.id !== row.id)
                          )
                        }
                      >
                        <Trash2 className='text-muted-foreground h-4 w-4' />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <UserPlus className='text-muted-foreground h-4 w-4' />
              <span>{t('Targeted User Daily Traffic Boosts')}</span>
            </CardTitle>
            <CardDescription>
              {t(
                'Grant temporary or permanent daily transfer traffic increases to specific users, or reset a user’s today usage immediately.'
              )}
            </CardDescription>
          </CardHeader>

          <CardContent className='space-y-5'>
            <div className='border-border space-y-3 rounded-lg border p-4'>
              <div className='flex flex-wrap items-center gap-2'>
                <Input
                  className='max-w-xs'
                  value={userKeyword}
                  onChange={(event) => setUserKeyword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void handleSearchUsers()
                    }
                  }}
                  placeholder={t('Search username, display name, or email')}
                />
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  disabled={searchingUsers}
                  onClick={() => void handleSearchUsers()}
                >
                  {searchingUsers ? (
                    <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
                  ) : (
                    <Search className='mr-1.5 h-3.5 w-3.5' />
                  )}
                  {t('Search User')}
                </Button>
              </div>

              {userResults.length > 0 ? (
                <div className='flex flex-wrap gap-2'>
                  {userResults.map((user) => (
                    <Button
                      key={user.id}
                      type='button'
                      variant={
                        targetUserId === String(user.id)
                          ? 'secondary'
                          : 'outline'
                      }
                      size='sm'
                      onClick={() => void handleInspectUser(user.id)}
                    >
                      #{user.id} {user.username}
                      {user.group ? ` (${user.group})` : ''}
                    </Button>
                  ))}
                </div>
              ) : null}

              {inspectedUser ? (
                <div className='border-border bg-muted/30 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-xs'>
                  <div className='space-y-0.5'>
                    <div className='text-foreground font-medium'>
                      #{inspectedUser.user.id} {inspectedUser.user.username}
                      <span className='text-muted-foreground ml-2'>
                        ({inspectedUser.user.group || 'default'})
                      </span>
                    </div>
                    <div className='text-muted-foreground font-mono'>
                      {t('Today Used')}:{' '}
                      {formatBytesLabel(inspectedUser.quota.used_bytes)} /{' '}
                      {formatBytesLabel(
                        inspectedUser.quota.effective_daily_bytes
                      )}{' '}
                      / {t('day')}
                    </div>
                  </div>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    disabled={resetUsageMutation.isPending}
                    onClick={() =>
                      resetUsageMutation.mutate(inspectedUser.user.id)
                    }
                  >
                    <RotateCcw className='mr-1.5 h-3.5 w-3.5' />
                    {t('Reset Today Usage')}
                  </Button>
                </div>
              ) : null}

              <div className='grid gap-4 md:grid-cols-2'>
                <div className='space-y-2'>
                  <Label htmlFor='media-override-uid'>{t('User ID')}</Label>
                  <div className='flex items-center gap-1.5'>
                    <Input
                      id='media-override-uid'
                      type='number'
                      min={1}
                      value={targetUserId}
                      onChange={(event) => setTargetUserId(event.target.value)}
                      placeholder='1'
                    />
                    <Button
                      type='button'
                      variant='outline'
                      size='icon'
                      aria-label={t('Inspect user traffic')}
                      disabled={inspectingUser || !targetUserId.trim()}
                      onClick={() => {
                        const parsed = Number.parseInt(targetUserId.trim(), 10)
                        if (Number.isFinite(parsed) && parsed > 0) {
                          void handleInspectUser(parsed)
                        }
                      }}
                    >
                      {inspectingUser ? (
                        <Loader2 className='h-4 w-4 animate-spin' />
                      ) : (
                        <Search className='h-4 w-4' />
                      )}
                    </Button>
                  </div>
                </div>

                <div className='space-y-2'>
                  <Label htmlFor='media-override-mb'>
                    {t('Targeted Bonus (+MB/day)')}
                  </Label>
                  <Input
                    id='media-override-mb'
                    type='number'
                    min={1}
                    max={1048576}
                    value={overrideBonusMB}
                    onChange={(event) => setOverrideBonusMB(event.target.value)}
                  />
                </div>

                <div className='space-y-2'>
                  <Label htmlFor='media-override-exp'>
                    {t('Expires At (Optional)')}
                  </Label>
                  <Input
                    id='media-override-exp'
                    type='datetime-local'
                    value={overrideExpiresInput}
                    onChange={(event) =>
                      setOverrideExpiresInput(event.target.value)
                    }
                  />
                </div>

                <div className='space-y-2'>
                  <Label htmlFor='media-override-note'>{t('Note')}</Label>
                  <Input
                    id='media-override-note'
                    value={overrideNote}
                    onChange={(event) => setOverrideNote(event.target.value)}
                    placeholder={t('e.g. Video creator trial')}
                  />
                </div>
              </div>

              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='flex flex-wrap items-center gap-1.5'>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => setOverrideExpiresInput('')}
                  >
                    {t('Permanent')}
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() =>
                      setOverrideExpiresInput(futureDateTimeLocal(24))
                    }
                  >
                    {t('+24 Hours')}
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() =>
                      setOverrideExpiresInput(futureDateTimeLocal(72))
                    }
                  >
                    {t('+3 Days')}
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() =>
                      setOverrideExpiresInput(futureDateTimeLocal(168))
                    }
                  >
                    {t('+7 Days')}
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() =>
                      setOverrideExpiresInput(futureDateTimeLocal(720))
                    }
                  >
                    {t('+30 Days')}
                  </Button>
                </div>
                <Button
                  type='button'
                  size='sm'
                  disabled={upsertOverrideMutation.isPending}
                  onClick={() => upsertOverrideMutation.mutate()}
                >
                  {upsertOverrideMutation.isPending ? (
                    <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
                  ) : (
                    <Plus className='mr-1.5 h-3.5 w-3.5' />
                  )}
                  {t('Save Targeted Boost')}
                </Button>
              </div>
            </div>

            <div className='space-y-3'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <Input
                  className='max-w-xs'
                  value={overrideFilter}
                  onChange={(event) => setOverrideFilter(event.target.value)}
                  placeholder={t('Filter boosted users by ID, name, or note')}
                />
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => void overridesQuery.refetch()}
                >
                  <RefreshCw className='mr-1.5 h-3.5 w-3.5' />
                  {t('Refresh')}
                </Button>
              </div>

              <div className='border-border overflow-x-auto rounded-lg border'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('User')}</TableHead>
                      <TableHead>{t('Targeted Bonus')}</TableHead>
                      <TableHead>{t('Status & Expiration')}</TableHead>
                      <TableHead>{t('Today Traffic')}</TableHead>
                      <TableHead>{t('Note')}</TableHead>
                      <TableHead className='text-right'>
                        {t('Actions')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overrides.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className='text-muted-foreground py-6 text-center text-xs'
                        >
                          {t('No targeted user traffic boosts configured.')}
                        </TableCell>
                      </TableRow>
                    ) : (
                      overrides.map((item) => (
                        <TableRow key={item.user_id}>
                          <TableCell className='text-xs'>
                            <div className='font-medium'>
                              #{item.user_id} {item.username}
                            </div>
                            <div className='text-muted-foreground'>
                              {item.group}
                            </div>
                          </TableCell>
                          <TableCell className='font-mono text-xs whitespace-nowrap'>
                            +{formatNumber(item.extra_daily_mb)} MB/{t('day')}
                          </TableCell>
                          <TableCell className='text-xs'>
                            <div className='flex flex-col gap-0.5'>
                              <Badge
                                className='w-fit'
                                variant={item.active ? 'secondary' : 'outline'}
                              >
                                {item.active ? t('Active') : t('Expired')}
                              </Badge>
                              <span className='text-muted-foreground text-[11px] whitespace-nowrap'>
                                {item.expires_at > 0
                                  ? formatUnixTimestamp(item.expires_at)
                                  : t('Permanent')}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className='font-mono text-xs whitespace-nowrap'>
                            {formatBytesLabel(item.today_used_bytes)} /{' '}
                            {formatBytesLabel(item.effective_daily_bytes)}
                          </TableCell>
                          <TableCell
                            className='text-muted-foreground max-w-[120px] truncate text-xs'
                            title={item.note || undefined}
                          >
                            {item.note || '-'}
                          </TableCell>
                          <TableCell className='text-right whitespace-nowrap'>
                            <div className='inline-flex items-center gap-1'>
                              <Button
                                type='button'
                                variant='ghost'
                                size='sm'
                                onClick={() =>
                                  handleSelectOverrideForEdit(item)
                                }
                              >
                                {t('Edit')}
                              </Button>
                              <Button
                                type='button'
                                variant='ghost'
                                size='sm'
                                disabled={resetUsageMutation.isPending}
                                onClick={() =>
                                  resetUsageMutation.mutate(item.user_id)
                                }
                              >
                                {t('Reset Today')}
                              </Button>
                              <Button
                                type='button'
                                variant='ghost'
                                size='icon'
                                aria-label={t('Delete')}
                                disabled={deleteOverrideMutation.isPending}
                                onClick={() =>
                                  deleteOverrideMutation.mutate(item.user_id)
                                }
                              >
                                <Trash2 className='text-muted-foreground h-4 w-4' />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </SettingsSection>
  )
}
