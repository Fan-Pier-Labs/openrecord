import { ResultComponent, Scan } from './labtestresulttype';

export interface ProviderComment {
  commentText: string;
  providerName: string;
  commentDate: string;
}

export interface LabResultsList {
  areResultsFullyLoaded: boolean
  isGroupingFullyLoaded: boolean
  groupBy: number
  newResultGroups: NewResultGroup[]
  organizationLoadMoreInfo: Record<string, { hasMoreData: boolean; serializedIndex: string }> | null;
  newResults: Record<string, NewResults>;
  newProviderPhotoInfo: Record<string, NewProviderPhotoInfo>
}

export interface NewResultGroup {
  key: string
  contactType: string
  resultList: string[]
  isInpatient: boolean
  isEDVisit: boolean
  isCurrentAdmission: boolean
  formattedAdmitDate?: string
  formattedDischargeDate?: string
  visitProviderID: string
  organizationID: string
  sortDate: string
  formattedDate: string
  isLargeGroup: boolean
}


export interface NewResults {
  name: string
  key: string
  showName: boolean
  showDetails: boolean
  orderMetadata: OrderMetadata
  resultComponents: ResultComponent[]
  shouldHideHistoricalData: boolean
  scans: Scan[]
  shareEverywhereLogin: boolean
  showProviderNotReviewed: boolean
  providerComments: ProviderComment[]
  tooManyVariants: boolean
  hasComment: boolean
  hasAllDetails: boolean
  isAbnormal: boolean
}

export interface OrderMetadata {
  orderProviderName: string
  authorizingProviderName: string
  authorizingProviderID: string
  unreadCommentingProviderName: string
  resultTimestampDisplay: string
  resultType: number
  read: number
}

export interface NewProviderPhotoInfo {
  name: string
  empId: string
  remoteEncrypted: boolean
  photoUrl: string
  providerId: string
  organizationId: string
}
