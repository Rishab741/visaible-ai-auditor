import { resolveBusinessWebsite } from '../resolver';
import { EvalCase, assert } from './framework';

async function resolvesToDomain(query: string, expectedDomainFragment: string): Promise<void> {
  const url = await resolveBusinessWebsite(query);
  const host = new URL(url).hostname.toLowerCase();
  assert(
    host.includes(expectedDomainFragment),
    `resolveBusinessWebsite("${query}") -> ${url} (host "${host}" does not include "${expectedDomainFragment}")`
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
    // Non-hospitality case — the resolver (and the whole pipeline) is meant
    // to work for any local business, not just hotels.
    name: 'resolver: "In-N-Out Burger" (a restaurant, not a hotel) resolves to in-n-out.com',
    tier: 'live',
    run: () => resolvesToDomain('In-N-Out Burger', 'in-n-out.com'),
  },
  {
    name: 'resolver: never resolves to a known directory/marketplace domain',
    tier: 'live',
    run: async () => {
      const url = await resolveBusinessWebsite('Ace Hotel Sydney');
      const host = new URL(url).hostname.toLowerCase();
      const directoryDomains = ['booking.com', 'expedia.com', 'agoda.com', 'hotels.com', 'tripadvisor.com', 'yelp.com', 'facebook.com'];
      assert(!directoryDomains.some((d) => host.includes(d)), `resolved to a directory/marketplace domain: ${host}`);
    },
  },
  {
    name: 'resolver: genuinely ambiguous query throws rather than silently guessing',
    tier: 'live',
    run: async () => {
      try {
        const url = await resolveBusinessWebsite('Fullerton Hotel');
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
