import { Amplify } from "aws-amplify";
import { config } from "../config";

export function configureAmplify(): void {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: config.userPoolId,
        userPoolClientId: config.userPoolClientId,
        signUpVerificationMethod: "code",
      },
    },
  });
}
