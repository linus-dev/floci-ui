import { isValidCidr, isValidPort } from "@/lib/network";
import type { SgRule } from "./SgRuleTable";

export function newRule(): SgRule {
  return {
    id: crypto.randomUUID(),
    type: "custom-tcp",
    protocol: "tcp",
    fromPort: "",
    toPort: "",
    cidr: "0.0.0.0/0",
    description: "",
  };
}

export function ruleToPermission(r: SgRule) {
  return {
    protocol: r.protocol,
    fromPort: r.protocol === "-1" ? 0 : (parseInt(r.fromPort) || 0),
    toPort:   r.protocol === "-1" ? 0 : (parseInt(r.toPort)   || 0),
    cidr: r.cidr,
  };
}

/** Returns per-field errors for a rule: { cidr?, fromPort?, toPort? } */
export function ruleErrors(rule: SgRule): { cidr?: string; fromPort?: string; toPort?: string } {
  const errs: { cidr?: string; fromPort?: string; toPort?: string } = {};
  if (rule.cidr && !isValidCidr(rule.cidr)) errs.cidr = "Invalid CIDR";
  if (rule.protocol !== "-1" && rule.protocol !== "icmp") {
    if (rule.fromPort !== "" && !isValidPort(rule.fromPort)) errs.fromPort = "0–65535";
    if (rule.toPort !== ""   && !isValidPort(rule.toPort))   errs.toPort   = "0–65535";
    if (!errs.fromPort && !errs.toPort && rule.fromPort !== "" && rule.toPort !== "") {
      if (Number(rule.fromPort) > Number(rule.toPort))
        errs.fromPort = `From > To`;
    }
  }
  return errs;
}

/** True when every rule in the table has valid CIDR and ports. */
export function allRulesValid(rules: SgRule[]): boolean {
  return rules.every((r) => {
    const e = ruleErrors(r);
    return !e.cidr && !e.fromPort && !e.toPort;
  });
}
