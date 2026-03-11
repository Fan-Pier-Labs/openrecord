import { AccountStatus } from "./accounts";
import { BillingDetails } from "../scrapers/myChart/bills/types";

export type CommonMyChartAccount = {
  hostname: string;
  username: string;
  password: string;
  key: string;
  verification?: AccountStatus;
  provider?: string;

  // Date that the account was verified. Cookies will expire after some time so it will need to be renewed later.
  verificationTime?: Date;

  billingDetails?: BillingDetails | BillingDetails["Data"] | null;
}