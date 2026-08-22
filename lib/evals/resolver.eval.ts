import { resolveHotelWebsite } from '../resolver';
import { EvalCase, assert } from './framework';

async function resolvesToDomain(query: string, expectedDomainFragment: string): Promise<void> {
  const url = await resolveHotelWebsite(query);
  const host = new URL(url).hostname.toLowerCase();
  assert(
    host.includes(expectedDomainFragment),
    `resolveHotelWebsite("${query}") -> ${url} (host "${host}" does not include "${expectedDomainFragment}")`
  );
}

export const resolverEvalCases: EvalCase[] = [
  {
    name: 'resolver: "Ace Hotel Sydney" resolves to acehotel.com',
    tier: 'live',
    run: () => resolvesToDomain('Ace Hotel Sydney', 'acehotel.com'),
  },
  {
    name: 'resolver: "The Fullerton Hotel Sydney" resolves to fullertonhotels.com',
    tier: 'live',
    run: () => resolvesToDomain('The Fullerton Hotel Sydney', 'fullertonhotels.com'),
  },
  {
    name: 'resolver: never resolves to a known OTA/aggregator domain',
    tier: 'live',
    run: async () => {
      const url = await resolveHotelWebsite('Ace Hotel Sydney');
      const host = new URL(url).hostname.toLowerCase();
      const otaDomains = ['booking.com', 'expedia.com', 'agoda.com', 'hotels.com', 'tripadvisor.com'];
      assert(!otaDomains.some((ota) => host.includes(ota)), `resolved to an OTA domain: ${host}`);
    },
  },
  {
    name: 'resolver: genuinely ambiguous query throws rather than silently guessing',
    tier: 'live',
    run: async () => {
      try {
        const url = await resolveHotelWebsite('Fullerton Hotel');
        throw new Error(`expected an ambiguity error, but got a URL: ${url}`);
      } catch (err) {
        assert(err instanceof Error, 'expected an Error to be thrown');
        assert(
          /Could not find an official website/i.test((err as Error).message),
          `expected the ambiguity error message, got: ${(err as Error).message}`
        );
      }
    },
  },
];
