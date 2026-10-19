// Card album: collect 3 sets of 9 cards from card packs.
import { getSave, save } from './storage';
import { grant, Reward } from './liveops';

export interface CardDef { id: string; name: string; rarity: 1 | 2 | 3 }
export interface SetDef { id: string; name: string; icon: string; cards: CardDef[]; reward: Reward }

const mk = (set: string, names: string[]): CardDef[] =>
  names.map((n, i) => ({ id: `${set}${i + 1}`, name: n, rarity: i < 6 ? 1 : i < 8 ? 2 : 3 }));

export const SETS: SetDef[] = [
  { id: 'a', name: 'Kale Hayvanları', icon: 'pw_falcon', reward: { coins: 400, hammer: 2 }, cards: mk('a', [
    'Savaş Atı', 'Av Köpeği', 'Kale Kedisi', 'Ak Baykuş', 'Şahin', 'Keçi', 'Taçlı Domuz', 'Kuğu', 'Yük Eşeği']) },
  { id: 'b', name: 'Şövalye Teçhizatı', icon: 'tile_red', reward: { coins: 600, row: 2, col: 2 }, cards: mk('b', [
    'Uzun Kılıç', 'Arma Kalkanı', 'Tüylü Miğfer', 'Savaş Baltası', 'Flamalı Mızrak', 'Zincir Zırh', 'Savaş Borusu', 'Arbalet', 'Altın Mahmuz']) },
  { id: 'c', name: 'Efsanevi Yaratıklar', icon: 'pw_orb', reward: { coins: 900, shuffle: 2, hammer: 2 }, cards: mk('c', [
    'Yavru Ejderha', 'Tek Boynuzlu At', 'Grifon', 'Anka Kuşu', 'Dost Trol', 'Küçük Peri', 'Deniz Yılanı', 'Taş Gargoyle', 'Bilge Baykuş']) },
];
export const ALBUM_REWARD: Reward = { coins: 3000, hammer: 5, row: 3, col: 3, shuffle: 3 };

export function cardDef(id: string): CardDef {
  return SETS.find((s) => s.id === id[0])!.cards.find((c) => c.id === id)!;
}

export function addPacks(n: number) {
  getSave().album.packs += n;
  save();
}

export function owned(id: string): number {
  return getSave().album.cards[id] ?? 0;
}

export function setProgress(set: SetDef): number {
  return set.cards.filter((c) => owned(c.id) > 0).length;
}

/** Open one pack: 3 cards, weighted by rarity, with a mild bias towards missing cards. */
export function openPack(): { id: string; isNew: boolean }[] {
  const s = getSave();
  if (s.album.packs <= 0) return [];
  s.album.packs--;
  const all = SETS.flatMap((x) => x.cards);
  const weight = (c: CardDef) => (c.rarity === 1 ? 10 : c.rarity === 2 ? 4 : 1.2) * (owned(c.id) ? 1 : 1.8);
  const out: { id: string; isNew: boolean }[] = [];
  for (let i = 0; i < 3; i++) {
    const total = all.reduce((a, c) => a + weight(c), 0);
    let r = Math.random() * total;
    let pick = all[0];
    for (const c of all) {
      r -= weight(c);
      if (r <= 0) {
        pick = c;
        break;
      }
    }
    const isNew = !owned(pick.id) && !out.some((o) => o.id === pick.id);
    s.album.cards[pick.id] = owned(pick.id) + 1;
    if (!isNew) s.coins += 15; // duplicates turn into a few coins
    out.push({ id: pick.id, isNew });
  }
  save();
  return out;
}

/** Sets completed that haven't paid out yet (and the full album). */
export function pendingSetRewards(): { name: string; reward: Reward }[] {
  const s = getSave();
  const out: { name: string; reward: Reward }[] = [];
  for (const set of SETS)
    if (setProgress(set) === 9 && !s.album.sets.includes(set.id)) {
      s.album.sets.push(set.id);
      grant(set.reward);
      out.push({ name: set.name, reward: set.reward });
    }
  if (SETS.every((x) => s.album.sets.includes(x.id)) && !s.album.sets.includes('all')) {
    s.album.sets.push('all');
    grant(ALBUM_REWARD);
    out.push({ name: 'Tüm Albüm', reward: ALBUM_REWARD });
  }
  save();
  return out;
}
