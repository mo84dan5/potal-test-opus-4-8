/**
 * 会話中に提示する汎用の選択肢(データ駆動)。
 * 戦闘開始の「はい/いいえ」をはじめ、将来の分岐会話にも再利用できる(OCP)。
 * 選択肢の `value` は不透明な文字列で、その解釈(戦闘開始など)はアプリ層が担う。
 * ドメインは「何を選ばせるか」だけを持ち、「選んだら何をするか」を知らない。
 */
export interface ChoiceOption {
  /** 画面に出すラベル(例: 'はい') */
  readonly label: string;
  /** 選択結果を表す不透明な値(例: 'battle:goblin' / 'no') */
  readonly value: string;
}

export interface ChoicePrompt {
  /** 問いかけ文(例: '戦いますか?') */
  readonly question: string;
  readonly options: readonly ChoiceOption[];
}
