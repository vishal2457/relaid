export interface DecodedUser {
  userId: number;
  email: string;
  username: string;
  organizationId: number | null;
  associatedToExternalOrg: boolean;
  exp?: number;
  iat?: number;
}
