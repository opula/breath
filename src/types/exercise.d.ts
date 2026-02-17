export type Exercise = {
  id: string;
  name: string;
  seq: {
    id: string;
    text?: string;
    count: number;
    value?: number[];
    type: 'inhale' | 'exhale' | 'hold' | 'breath' | 'text' | 'double-inhale';
  }[];
  loopable: boolean;
};
