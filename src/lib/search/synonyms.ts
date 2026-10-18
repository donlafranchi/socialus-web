// #916 — Explore search's synonyms, the one place they live. Each group is a set of words that mean the same
// thing to someone looking; typing any one finds Pages and posts that use any other. Stemming already joins
// plurals (flowers/flower, nurseries/nursery), so a group only needs the words a stemmer cannot join.
// Precedent: Algolia's and Elasticsearch's synonym lists, kept as data beside the index.
export const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ['florist', 'flowers', 'flower'],
  ['nursery', 'plants', 'garden'],
  ['cafe', 'coffee'],
  ['farm stand', 'produce'],
  ['bakery', 'baking', 'bread'],
]
