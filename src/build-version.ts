export interface BuildVersion {
  displayVersion: string;
  fullSha: string | null;
  shortSha: string | null;
  dirty: boolean;
  githubCommitUrl: string | null;
}
