// Mock "recent folders" for the New Session sheet's folder picker — Phase 4
// has no real filesystem access, so this stands in for a VPS directory
// listing. Real data arrives once the bridge can list paths on the VPS.
export const mockRecentFolders: string[] = [
  '/root/projects/PiG',
  '/root/projects/other-app',
  '/root/scratch',
  '/home/user/workspace',
];
