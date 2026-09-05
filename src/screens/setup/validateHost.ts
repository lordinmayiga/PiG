/**
 * Client-side validation for VPS bridge host input.
 * Accepts formats:
 *   - "147.79.101.172:8787"
 *   - "http://147.79.101.172:8787/" (auto-cleaned)
 *   - "ws://bridge.example.com:8443" (auto-cleaned)
 *   - "localhost:8787"
 *   - "[::1]:8787" (IPv6)
 * Rejects:
 *   - Empty input
 *   - Missing port (e.g. "147.79.101.172")
 *   - Port out of range 1-65535 or non-numeric
 *   - Invalid IP octets or malformed hostnames
 */

export interface HostValidationResult {
  valid: boolean;
  cleanHost?: string;
  error?: string;
}

/**
 * Strips leading protocols (http://, https://, ws://, wss://) and trailing slashes/paths.
 */
export function sanitizeHostInput(input: string): string {
  let cleaned = input.trim();
  // Strip protocol scheme (http://, https://, ws://, wss://)
  cleaned = cleaned.replace(/^(?:https?|wss?):\/\//i, '');
  // Strip trailing slashes and paths
  cleaned = cleaned.replace(/\/.*$/, '');
  return cleaned.trim();
}

/**
 * Validates the raw host input and returns cleanHost if valid, or an error message.
 */
export function validateHost(rawHost: string): HostValidationResult {
  const trimmed = (rawHost ?? '').trim();
  if (!trimmed) {
    return { valid: false, error: 'Host is required' };
  }

  const cleaned = sanitizeHostInput(trimmed);
  if (!cleaned) {
    return { valid: false, error: 'Invalid host' };
  }

  let hostPart = cleaned;
  let portPart: string | undefined;

  // Check for IPv6 bracket notation: [::1]:8787
  if (cleaned.startsWith('[')) {
    const closingBracket = cleaned.indexOf(']');
    if (closingBracket === -1) {
      return { valid: false, error: 'Malformed IPv6 address format' };
    }
    hostPart = cleaned.slice(1, closingBracket);
    const rest = cleaned.slice(closingBracket + 1);
    if (rest.startsWith(':')) {
      portPart = rest.slice(1);
    }
  } else {
    // Check for standard hostname:port or ipv4:port
    const colonIdx = cleaned.lastIndexOf(':');
    if (colonIdx !== -1) {
      hostPart = cleaned.slice(0, colonIdx);
      portPart = cleaned.slice(colonIdx + 1);
    }
  }

  if (!portPart) {
    return { valid: false, error: 'Port is required (e.g. 203.0.113.10:8443)' };
  }

  if (!/^\d+$/.test(portPart)) {
    return { valid: false, error: 'Port must be a valid number' };
  }

  const portNum = Number(portPart);
  if (portNum < 1 || portNum > 65535) {
    return { valid: false, error: 'Port must be between 1 and 65535' };
  }

  if (!hostPart) {
    return { valid: false, error: 'Host is required' };
  }

  // Validate IPv4
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Regex.test(hostPart)) {
    const octets = hostPart.split('.').map(Number);
    const validOctets = octets.every((oct) => oct >= 0 && oct <= 255);
    if (!validOctets) {
      return { valid: false, error: 'Invalid IPv4 address octets (0-255)' };
    }
    return { valid: true, cleanHost: `${hostPart}:${portNum}` };
  }

  // Validate Hostname / Domain / Localhost (RFC 1123)
  const hostnameRegex = /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/;
  if (hostnameRegex.test(hostPart)) {
    return { valid: true, cleanHost: `${hostPart}:${portNum}` };
  }

  // Check IPv6 basic validity if brackets were used
  if (cleaned.startsWith('[') && hostPart.includes(':')) {
    return { valid: true, cleanHost: `[${hostPart}]:${portNum}` };
  }

  return { valid: false, error: 'Invalid hostname or IP address format' };
}
