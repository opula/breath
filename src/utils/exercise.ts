// import {delay} from 'lodash';

// export const incrementalCompletionTimer = async (
//   totalTime: number,
//   successCb: () => void,
//   incTime?: number,
//   incCb?: (value: number) => void,
// ) => {
//   let timer: NodeJS.Timer | undefined;
//   let count = 0;

//   if (incTime && !!incCb) {
//     timer = setInterval(() => {
//       count++;
//       incCb(count);
//     }, incTime);
//   }

//   await new Promise(resolve => {
//     delay(() => {
//       timer && clearInterval(timer);
//       resolve(undefined);
//     }, totalTime);
//   });

//   return successCb();
// };

import {defer, delay} from 'lodash';

export const incrementalCompletionTimer = (
  totalTime: number,
  successCb: () => void,
  incTime?: number,
  incCb?: (value: number) => void,
): Promise<void> => {
  let timer: NodeJS.Timer | undefined;
  let count = 0;

  if (incTime && !!incCb) {
    // timer = setInterval(() => {
    //   count++;
    //   incCb(count);
    // }, incTime);
    let startTime = incTime;
    while (startTime < totalTime) {
      delay(() => {
        count++;
        incCb(count);
      }, startTime);
      startTime = startTime + incTime;
    }
  }

  return new Promise((resolve, reject) => {
    defer(() => {
      const timeout = delay(() => {
        timer && clearInterval(timer);
        resolve(successCb());
      }, totalTime);

      const cancel = () => {
        timer && clearInterval(timer);
        clearTimeout(timeout);
        reject(new Error('Timer cancelled'));
      };

      return cancel;
    });
  });
};
