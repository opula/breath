import {toNumber} from 'lodash';

export const convertSecondsToHHMM = (secs: number) => {
  const converted = new Date(secs * 1000).toISOString().slice(14, 21);
  const minutes = toNumber(converted.slice(0, 2));
  const seconds = toNumber(converted.slice(3, converted.length + 1));

  return {minutes, seconds};
};
