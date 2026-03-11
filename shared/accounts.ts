

export enum AccountStatus {

  // We haven't yet attempted to verify the login information for this account. 
  UNVERIFIED = 'Unverified',

  MISSING_USERNAME = 'Missing Username',
  MISSING_PASSWORD = 'Missing Password',

  INVALID_LOGIN = 'Invalid Login',

  // This could mean 
  // 1) The user connected an email account that isn't the one MyChart uses
  // 2) Our code is bad and can't find the right email.
  CANT_FIND_2FA_CODE = 'Cant find 2fa code',

  // This could mean
  // 1) We are trying the wrong 2fa code (from a different email)
  INVALID_2FA_CODE = 'Invalid 2fa code',
  
  // If the user hsn't logged in for a while, there might be new TOS they need to accept. 
  // I might be down to just accept the TOS for the user. 
  NEEDS_TOS_ACCEPTED = 'Needs TOS Accepted',

  // If we hit a page that we don't expect to get in MyChart. 
  UNKNOWN_ERROR = 'Unknown Error',

  // Can't reach the server. 
  NETWORK_ERROR = 'Network Error',

  // It all works! yay! 
  LOGGED_IN = 'Logged In',
}