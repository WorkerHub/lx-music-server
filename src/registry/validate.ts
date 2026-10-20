// Shared validation for the two write paths that create credentials: self
// registration and admin-created users (including password resets). Usernames
// are restricted to a conservative ASCII set because they double as Durable
// Object names.
//
// Password policy: at least 8 characters, at most 128. Passwords shorter than
// 16 are allowed but considered weak; the hint is a UI concern (register page /
// admin panel) and is not enforced here.

export const USERNAME_RE = /^[A-Za-z0-9_-]{3,32}$/
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128

// `__server__` is the fixed UserSyncDO instance used by `/id`; any `__` prefix
// is reserved so a user account can never collide with an internal DO name.
export const isReservedName = (name: string): boolean => name.startsWith('__')

export const validateUsername = (name: string): string | null => {
  if (!name) return 'username is required'
  if (!USERNAME_RE.test(name))
    return 'username must be 3-32 characters of letters, digits, underscore or hyphen'
  return null
}

export const validatePassword = (password: string): string | null => {
  if (password.length < PASSWORD_MIN_LENGTH)
    return `password must be at least ${PASSWORD_MIN_LENGTH} characters`
  if (password.length > PASSWORD_MAX_LENGTH)
    return `password must be at most ${PASSWORD_MAX_LENGTH} characters`
  return null
}

export const isRegistrationMode = (
  value: unknown,
): value is LX.RegistrationMode =>
  value === 'closed' || value === 'open' || value === 'approval'

export const isUserStatus = (value: unknown): value is LX.UserStatus =>
  value === 'active' || value === 'pending' || value === 'disabled'

export const isUserSource = (value: unknown): value is LX.UserSource =>
  value === 'imported' || value === 'self' || value === 'admin'

export const isAddMusicLocationType = (
  value: unknown,
): value is LX.AddMusicLocationType => value === 'top' || value === 'bottom'

export const isValidMaxSnapshotNum = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 1 &&
  value <= 100
