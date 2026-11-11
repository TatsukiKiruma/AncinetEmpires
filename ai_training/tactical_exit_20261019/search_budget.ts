/** 增加根覆盖容量，单单位连动深度与全体时延门槛保持原值。 */
export const SEARCH_TOP_K = 16;
export const SEARCH_FOLLOW_NODES = 24;
export const SEARCH_MAX_OWN_NODES = SEARCH_TOP_K * (SEARCH_FOLLOW_NODES + 1);
