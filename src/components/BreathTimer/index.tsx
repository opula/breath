import React, {useEffect, useRef, useState} from 'react';
import {Text, View} from 'react-native';
import {delay, padStart, range} from 'lodash';
import {AnimatePresence, MotiView} from 'moti';
import tw from '../../utils/tw';

function chainTimeouts(timeouts: number[], callback: (index: number) => void) {
  const [timeout, ...rest] = timeouts;
  setTimeout(() => {
    callback(timeouts.length - rest.length);
    chainTimeouts(rest.concat(timeout), callback);
  }, timeout);
}

interface BreathTimerProps {
  inhale: number;
  exhale: number;
  inhaleHold?: number;
  exhaleHold?: number;
}

export const BreathTimer = ({
  inhale,
  exhale,
  inhaleHold,
  exhaleHold,
}: BreathTimerProps) => {
  const [count, setCount] = useState('');
  const [label, setLabel] = useState('');

  useEffect(() => {
    const runSegment = async (time: number) => {
      await new Promise((resolve, reject) => {
        const moments = range(time);
        moments.forEach(index =>
          delay(() => setCount(`${index + 1}`), index * 1000),
        );

        delay(() => resolve(undefined), time * 1000);
      });
    };

    const runSequence = async () => {
      setLabel('inhale');
      await runSegment(inhale);
      if (inhaleHold) {
        setLabel('hold');
        await runSegment(inhaleHold);
      }

      setLabel('exhale');
      await runSegment(exhale);
      if (exhaleHold) {
        setLabel('hold');
        await runSegment(exhaleHold);
      }

      runSequence();
    };

    (async () => {
      await runSequence();
    })();
  }, []);

  return (
    <View style={tw`absolute inset-0 items-center justify-center`}>
      <AnimatePresence exitBeforeEnter>
        <MotiView
          key={label}
          from={{opacity: 0}}
          animate={{opacity: 1}}
          exit={{opacity: 0}}
          transition={{opacity: {type: 'timing', duration: 400}}}
          style={tw`items-center`}>
          <Text
            style={[tw`text-3xl font-inter text-neutral-300 text-center`, {fontVariant: ['tabular-nums']}]}>
            {padStart(count, 2, '0')}
          </Text>
          <Text
            style={[tw`text-base font-inter text-neutral-300 text-center mt-1`, {fontVariant: ['tabular-nums']}]}>
            {label}
          </Text>
        </MotiView>
      </AnimatePresence>
    </View>
  );
};
