/**
 * EC2 / AWS-specific validators.
 * Network-level primitives (CIDR, ports) are imported from src/lib/network.ts.
 */
import { isValidCidr, isValidPort } from '@/lib/network'

export { isValidCidr, isCidrWithinBlock, isValidPort, isValidPortRange } from '@/lib/network'

/**
 * Returns a human-readable error for an SG inbound/outbound rule, or null when valid.
 */
export function validateSgRule(
  protocol: string,
  fromPort: string,
  toPort: string,
  cidr: string,
): string | null {
  if (!cidr.trim()) return 'Source/destination CIDR is required.'
  if (!isValidCidr(cidr.trim()))
    return `"${cidr.trim()}" is not a valid CIDR (e.g. 10.0.0.0/16 or 0.0.0.0/0).`
  if (protocol !== '-1' && protocol !== 'icmp') {
    if (!isValidPort(fromPort))
      return `From port "${fromPort}" must be an integer 0–65535.`
    if (!isValidPort(toPort))
      return `To port "${toPort}" must be an integer 0–65535.`
    if (Number(fromPort) > Number(toPort))
      return `From port (${fromPort}) cannot be greater than To port (${toPort}).`
  }
  return null
}

/** True when a key pair name matches AWS constraints (1–255 chars, alphanumeric/hyphens/underscores/dots). */
export function isValidKeyPairName(name: string): boolean {
  return /^[a-zA-Z0-9._-]{1,255}$/.test(name.trim())
}

/** True when an AMI ID matches the expected AWS pattern (ami- + 8 or 17 hex chars). */
export function looksLikeAmiId(id: string): boolean {
  return /^ami-[0-9a-f]{8}([0-9a-f]{9})?$/.test(id.trim())
}

/** True when `size` is a valid EBS volume size in GiB (1–16384). */
export function isValidVolumeSize(size: number): boolean {
  return Number.isInteger(size) && size >= 1 && size <= 16384
}
