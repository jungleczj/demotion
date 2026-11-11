import { Asset } from '../types';

export default function AssetCredit({ asset }: { asset: Asset | null | undefined }) {
  if (asset?.provider !== 'coverr') return null;
  return <small className="asset-credit">Video by <a href={asset.authorUrl || asset.sourceUrl} target="_blank" rel="noreferrer">{asset.author}</a> on <a href="https://coverr.co" target="_blank" rel="noreferrer">Coverr</a></small>;
}
