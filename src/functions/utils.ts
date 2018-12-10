export interface CloudFunctionNameDetails {
  projectId: string;
  location: string;
  name: string;
}

export function getDetailsFromName(name: string): CloudFunctionNameDetails {
  const match = name.match(
    /^projects\/([^\/]+)\/locations\/([^\/]+)\/functions\/([^\/]+)/
  );

  if (!match) {
    throw new Error('Malformed Cloud Function name');
  }

  return {
    projectId: match[1],
    location: match[2],
    name: match[3]
  };
}
