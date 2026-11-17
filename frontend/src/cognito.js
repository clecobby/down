import { Amplify } from 'aws-amplify';
import { cognitoUserPoolsTokenProvider } from 'aws-amplify/auth/cognito';
import { CookieStorage } from 'aws-amplify/utils';

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
      userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
      loginWith: { email: true },
    },
  },
});

// Keep tokens in cookies rather than localStorage (see Cognito guidance on token storage).
cognitoUserPoolsTokenProvider.setKeyValueStorage(
  new CookieStorage({ secure: location.protocol === 'https:', sameSite: 'strict', expires: 30 }),
);

// Turn Cognito error names into short, human messages for our UI.
const MESSAGES = {
  UsernameExistsException: 'An account with this email already exists. Try logging in.',
  NotAuthorizedException: 'Wrong email or password.',
  UserNotFoundException: 'Wrong email or password.',
  CodeMismatchException: "That code isn't right. Check your email and try again.",
  ExpiredCodeException: 'That code has expired. Send a new one.',
  LimitExceededException: 'Too many attempts. Wait a bit and try again.',
  TooManyRequestsException: 'Too many attempts. Wait a bit and try again.',
  InvalidPasswordException: 'Password needs 10+ characters with upper and lower case letters and a number.',
  InvalidParameterException: 'Please check what you entered.',
};
export const authMessage = (e) => MESSAGES[e?.name] || e?.message || 'Something went wrong';
