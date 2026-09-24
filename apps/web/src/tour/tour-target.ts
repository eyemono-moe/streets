/** 案内が指す場所。広い画面と狭い画面の、同じ役割の要素に同じ印を付ける。 */
export type TourTarget = "columns" | "add-column" | "compose" | "account";

/** 指す場所に付ける属性。今描いている画面にだけあるので、幅に合わせて指す先が替わる。 */
export const tourTarget = (name: TourTarget) => ({ "data-tour": name });
