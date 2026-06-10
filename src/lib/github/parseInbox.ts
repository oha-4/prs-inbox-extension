import type { PrState, PullRequest } from '../../types';

export class ParseError extends Error {}

export interface ParsedInboxPage {
  prs: PullRequest[];
  currentPage: number;
  totalPages: number;
  totalCount: number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * /pulls/inbox/queries のレスポンスをパースする。
 * 確定形: payload.pullsInboxSurfaceContentRoute.{results, pageInfo, error}
 * キー名変更に備え、payload直下の「resultsを配列で持つオブジェクト」も走査する。
 */
export function parseInboxResponse(body: unknown): ParsedInboxPage {
  if (!isRecord(body) || !isRecord(body.payload)) {
    throw new ParseError('payload missing');
  }
  const payload = body.payload;

  let route: Record<string, unknown> | null = null;
  const direct = payload['pullsInboxSurfaceContentRoute'];
  if (isRecord(direct) && Array.isArray(direct.results)) {
    route = direct;
  } else {
    for (const value of Object.values(payload)) {
      if (isRecord(value) && Array.isArray(value.results)) {
        route = value;
        break;
      }
    }
  }
  if (!route) throw new ParseError('no route with results[] in payload');
  if (route.error != null) {
    throw new ParseError(`route error: ${JSON.stringify(route.error).slice(0, 200)}`);
  }

  const results = route.results as unknown[];
  const prs: PullRequest[] = [];
  for (const raw of results) {
    const pr = parsePr(raw);
    if (pr) prs.push(pr);
  }
  if (results.length > 0 && prs.length === 0) {
    throw new ParseError('all results failed to parse (shape changed?)');
  }

  const pageInfo = isRecord(route.pageInfo) ? route.pageInfo : {};
  return {
    prs,
    currentPage: asNumber(pageInfo.currentPage, 1),
    totalPages: asNumber(pageInfo.totalPages, 1),
    totalCount: asNumber(pageInfo.totalCount, prs.length),
  };
}

function parsePr(raw: unknown): PullRequest | null {
  if (!isRecord(raw)) return null;
  const repoNameWithOwner = raw.repoNameWithOwner;
  const permalink = raw.permalink;
  const number = raw.number;
  const title = raw.title;
  if (
    typeof repoNameWithOwner !== 'string' ||
    typeof permalink !== 'string' ||
    typeof number !== 'number' ||
    typeof title !== 'string'
  ) {
    return null;
  }
  const author = isRecord(raw.author) ? raw.author : {};
  const state = raw.state;
  return {
    id: String(raw.id ?? permalink),
    number,
    title,
    url: permalink,
    repoNameWithOwner,
    authorLogin: typeof author.displayLogin === 'string' ? author.displayLogin : '',
    state: state === 'MERGED' || state === 'CLOSED' ? (state as PrState) : 'OPEN',
    isDraft: raw.isDraft === true,
    commentCount: asNumber(raw.commentCount, 0),
    isReadByCurrentUser: raw.isReadByCurrentUser !== false,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
  };
}

function asNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
