export function AppVersion() {
  const version = __APP_VERSION__;
  const description = version.fullSha
    ? `Commit ${version.fullSha}${version.dirty ? ' — includes local changes after this commit' : ''}`
    : 'This local build has no Git commit metadata.';
  return (
    <span className="app-version">
      Fate Core Companion ·{' '}
      {version.githubCommitUrl ? (
        <a href={version.githubCommitUrl} target="_blank" rel="noreferrer" title={description}>
          {version.displayVersion}
        </a>
      ) : (
        <span title={description}>{version.displayVersion}</span>
      )}
    </span>
  );
}
