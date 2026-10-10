import { isIP } from "node:net";

/** Uses the final address added by the hosting proxy, rejecting unparseable forwarding chains. */
export function clientAddressFromForwardedFor(header: string | string[] | undefined): string | undefined {
  const forwardedFor = Array.isArray(header) ? header.join(",") : header;
  const address = forwardedFor?.split(",").at(-1)?.trim();
  return address && isIP(address) ? address : undefined;
}
