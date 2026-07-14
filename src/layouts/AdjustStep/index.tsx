import React, { useEffect, useMemo, useRef, useState } from "react";
import { AppSheet } from "../../components/AppSheet";
import {
  View,
  Text,
  TextInput,
  Keyboard,
  Pressable,
  ScrollView,
} from "react-native";
import tw from "../../utils/tw";
import { RouteProp } from "@react-navigation/native";
import { MainStackParams } from "../../navigation";
import { Exercise } from "../../types/exercise";
import {
  exerciseById,
  updateExerciseStepCount,
  updateExerciseStepRamp,
  updateExerciseStepText,
  updateExerciseStepValue,
} from "../../state/exercises.atom";
import { use$ } from "concordia/react";
import Decimal from "decimal.js";
import { HorizontalDial } from "../../components/HorizontalDial";
import { convertSecondsToHHMM } from "../../utils/pretty";
import { Overline } from "../../components/Overline";

interface Props {
  route: RouteProp<MainStackParams, "AdjustStep">;
}

const breathLabels = ["Inhale", "Hold", "Exhale", "Hold"];
const SINGLE_PRESETS = [2, 4, 6, 8, 12, 20];

const DialGroup = ({
  label,
  children,
  disabled = false,
}: {
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
}) => (
  <View
    style={[tw`mt-5`, disabled ? tw`opacity-40` : undefined]}
    pointerEvents={disabled ? "none" : "auto"}
  >
    <Text
      style={[
        tw`font-mono text-[9px] text-mb-mute uppercase mb-2`,
        { letterSpacing: 2 },
      ]}
    >
      {label}
    </Text>
    {children}
  </View>
);

const BigTitleLabel = ({ children }: { children: React.ReactNode }) => (
  <Text
    style={[
      tw`font-display text-mb-fg uppercase mt-4`,
      { fontSize: 40, letterSpacing: -1.2, lineHeight: 44 },
    ]}
    numberOfLines={1}
  >
    {children}
  </Text>
);

const displayKind = (type: string) => {
  if (type === "double-inhale") return "Double inhale";
  if (type === "repeat") return "Repeat";
  if (type === "text") return "Message";
  return type;
};

export const AdjustStep = ({ route }: Props) => {
  const { exerciseId, stepId } = route.params;
  const exercise = use$(exerciseById(exerciseId));

  const step = useMemo(
    () => exercise.seq.find((s) => s.id === stepId),
    [exercise, stepId],
  );
  const { type, value, count } = step || {};

  const isBreath = type === "breath";
  const isDoubleInhale = type === "double-inhale";
  const isText = type === "text";
  const isRepeat = type === "repeat";
  const isSingle = type === "exhale" || type === "hold" || type === "inhale";

  const totalBreathDuration = useMemo(() => {
    if (!isBreath || !Array.isArray(value) || !count) return null;
    const sum = value.reduce((acc: number, v: number) => acc + v, 0);
    return count * sum;
  }, [isBreath, value, count]);

  if (isBreath) {
    return (
      <AppSheet>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={tw`pt-2 pb-6 px-2`}>
            <Overline
              accent
              right={`kind · ${displayKind(type ?? "").toLowerCase()}`}
            >
              Adjusting phase
            </Overline>
            <BigTitleLabel>Breath cycle</BigTitleLabel>

            {breathLabels.map((label, index) => (
              <DialGroup key={`breath-${index}`} label={label}>
                <HorizontalDial
                  min={0}
                  max={30}
                  step={0.1}
                  suffix="s"
                  defaultValue={(value as number[])?.[index] ?? 0}
                  onChange={(newValue: number) => {
                    updateExerciseStepValue(exerciseId, stepId, (value as number[]).map((v, i) =>
                          i === index
                            ? new Decimal(newValue).toDecimalPlaces(1).toNumber()
                            : v,
                        ));
                  }}
                />
              </DialGroup>
            ))}

            <DialGroup label="Count">
              <HorizontalDial
                min={0}
                max={1000}
                step={1}
                suffix="×"
                zeroLabel="∞"
                defaultValue={count ?? 0}
                onChange={(v) =>
                  updateExerciseStepCount(exerciseId, stepId, Math.round(v))
                }
              />
            </DialGroup>

            <DialGroup label="Ramp" disabled={!count}>
              <HorizontalDial
                min={1}
                max={3}
                step={0.1}
                suffix="×"
                defaultValue={step?.ramp ?? 1}
                onChange={(v) =>
                  updateExerciseStepRamp(exerciseId, stepId, new Decimal(v).toDecimalPlaces(1).toNumber())
                }
              />
            </DialGroup>

            <View style={tw`mt-8 items-center`}>
              {totalBreathDuration && totalBreathDuration > 0 ? (
                <Text
                  style={[
                    tw`font-mono text-mb-mute uppercase text-[10px]`,
                    { letterSpacing: 2 },
                  ]}
                >
                  {(() => {
                    const { minutes, seconds } =
                      convertSecondsToHHMM(totalBreathDuration);
                    return minutes > 0
                      ? `total ${minutes}m ${seconds}s`
                      : `total ${seconds}s`;
                  })()}
                </Text>
              ) : (
                <Text
                  style={[
                    tw`font-mono text-mb-mute uppercase text-[10px]`,
                    { letterSpacing: 2 },
                  ]}
                >
                  at your discretion
                </Text>
              )}
            </View>
          </View>
        </ScrollView>
      </AppSheet>
    );
  }

  if (isDoubleInhale) {
    const doubleVal = (value as number[] | undefined) ?? [1.5, 0.3, 1.5];
    const doubleLabels = ["First inhale", "Pause", "Second inhale"];
    const totalSec = doubleVal.reduce((a, v) => a + v, 0);

    return (
      <AppSheet>
        <View style={tw`pt-2 pb-6 px-2`}>
          <Overline
            accent
            right={`kind · ${displayKind(type ?? "").toLowerCase()}`}
          >
            Adjusting phase
          </Overline>
          <BigTitleLabel>Double inhale</BigTitleLabel>

          {doubleLabels.map((label, index) => (
            <DialGroup key={`di-${index}`} label={label}>
              <HorizontalDial
                min={0}
                max={10}
                step={0.1}
                suffix="s"
                defaultValue={doubleVal[index] ?? 0}
                onChange={(v) =>
                  updateExerciseStepValue(exerciseId, stepId, doubleVal.map((x, i) =>
                        i === index
                          ? new Decimal(v).toDecimalPlaces(1).toNumber()
                          : x,
                      ))
                }
              />
            </DialGroup>
          ))}

          <View style={tw`mt-8 items-center`}>
            <Text
              style={[
                tw`font-mono text-mb-mute uppercase text-[10px]`,
                { letterSpacing: 2 },
              ]}
            >
              total {totalSec.toFixed(1)}s
            </Text>
          </View>
        </View>
      </AppSheet>
    );
  }

  if (isRepeat) {
    const lookback = (value as number[] | undefined)?.[0] ?? 1;

    return (
      <AppSheet>
        <View style={tw`pt-2 pb-6 px-2`}>
          <Overline
            accent
            right={`kind · ${displayKind(type ?? "").toLowerCase()}`}
          >
            Adjusting phase
          </Overline>
          <BigTitleLabel>Repeat</BigTitleLabel>

          <DialGroup label="Lookback">
            <HorizontalDial
              min={1}
              max={20}
              step={1}
              suffix=" phases"
              defaultValue={lookback}
              onChange={(v) =>
                updateExerciseStepValue(exerciseId, stepId, [Math.round(v)])
              }
            />
          </DialGroup>

          <DialGroup label="Count">
            <HorizontalDial
              min={1}
              max={1000}
              step={1}
              suffix="×"
              defaultValue={count ?? 1}
              onChange={(v) =>
                updateExerciseStepCount(exerciseId, stepId, Math.round(v))
              }
            />
          </DialGroup>

          <DialGroup label="Ramp" disabled={!count || count <= 1}>
            <HorizontalDial
              min={1}
              max={3}
              step={0.1}
              suffix="×"
              defaultValue={step?.ramp ?? 1}
              onChange={(v) =>
                updateExerciseStepRamp(exerciseId, stepId, new Decimal(v).toDecimalPlaces(1).toNumber())
              }
            />
          </DialGroup>
        </View>
      </AppSheet>
    );
  }

  if (isText) {
    return (
      <AdjustTextStep step={step!} exerciseId={exerciseId} stepId={stepId} />
    );
  }

  // Single (inhale / exhale / hold)
  return (
    <AppSheet>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={tw`pt-2 pb-6 px-2`}>
          <Overline
            accent
            right={`kind · ${displayKind(type ?? "").toLowerCase()}`}
          >
            Adjusting phase
          </Overline>
          <BigTitleLabel>{displayKind(type ?? "")}</BigTitleLabel>

          {/* Big numeric readout */}
          <View style={tw`mt-6 items-center`}>
            <Text
              style={[
                tw`font-display text-mb-fg`,
                {
                  fontSize: 88,
                  letterSpacing: -3,
                  lineHeight: 92,
                  fontVariant: ["tabular-nums"],
                },
              ]}
            >
              {count && count > 0 ? count : "∞"}
              {count && count > 0 ? (
                <Text
                  style={[
                    tw`font-display text-mb-mute`,
                    { fontSize: 28, letterSpacing: -1 },
                  ]}
                >
                  s
                </Text>
              ) : null}
            </Text>
          </View>

          {isSingle ? (
            <>
              <DialGroup label="Duration">
                <HorizontalDial
                  min={0}
                  max={1000}
                  step={1}
                  suffix="s"
                  zeroLabel="∞"
                  defaultValue={count ?? 0}
                  onChange={(v) =>
                    updateExerciseStepCount(exerciseId, stepId, Math.round(v))
                  }
                />
              </DialGroup>

              {/* Quick presets */}
              <View style={tw`mt-5`}>
                <Text
                  style={[
                    tw`font-mono text-[9px] text-mb-mute uppercase mb-2`,
                    { letterSpacing: 2 },
                  ]}
                >
                  quick presets
                </Text>
                <View style={tw`flex-row`}>
                  {SINGLE_PRESETS.map((p, i) => {
                    const active = count === p;
                    return (
                      <Pressable
                        key={p}
                        onPress={() =>
                          updateExerciseStepCount(exerciseId, stepId, p)
                        }
                        style={({ pressed }) => [
                          tw.style(
                            `flex-1 py-3 items-center border-mb-line`,
                            i > 0 ? `border-l` : undefined,
                          ),
                          pressed && tw`opacity-70`,
                        ]}
                      >
                        <Text
                          style={[
                            tw`font-item text-[16px]`,
                            active ? tw`text-mb-accent` : tw`text-mb-ink`,
                          ]}
                        >
                          {p}s
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <DialGroup label="Ramp" disabled={!count}>
                <HorizontalDial
                  min={1}
                  max={3}
                  step={0.1}
                  suffix="×"
                  defaultValue={step?.ramp ?? 1}
                  onChange={(v) =>
                    updateExerciseStepRamp(exerciseId, stepId, new Decimal(v).toDecimalPlaces(1).toNumber())
                  }
                />
              </DialGroup>
            </>
          ) : null}
        </View>
      </ScrollView>
    </AppSheet>
  );
};

const AdjustTextStep = ({
  step,
  exerciseId,
  stepId,
}: {
  step: Exercise["seq"][number];
  exerciseId: string;
  stepId: string;
}) => {
  const [text, setText] = useState(step.text ?? "");
  const [isFocused, setIsFocused] = useState(false);
  const textRef = useRef(text);

  useEffect(
    () => () => {
      updateExerciseStepText(exerciseId, stepId, textRef.current);
    },
    [],
  );

  return (
    <AppSheet>
      <ScrollView
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        scrollEnabled={false}
      >
        <View style={tw`pt-2 pb-6 px-2`}>
          <Overline accent right={`kind · message`}>
            Adjusting phase
          </Overline>
          <BigTitleLabel>Message</BigTitleLabel>

          <DialGroup label="Text">
            <View style={tw`flex-row items-center border-b border-mb-line`}>
              <TextInput
                style={tw`flex-1 font-inter text-mb-ink py-2 text-base`}
                value={text}
                onChangeText={(val) => {
                  setText(val);
                  textRef.current = val;
                }}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                autoFocus={!step.text}
                placeholder="Enter a message…"
                placeholderTextColor="#6E6E74"
                multiline
              />
              <Pressable onPress={Keyboard.dismiss} hitSlop={8}>
                <Text
                  style={[
                    tw`font-mono uppercase text-[10px] ml-2`,
                    isFocused ? tw`text-mb-accent` : tw`text-mb-mute`,
                    { letterSpacing: 2 },
                  ]}
                >
                  done
                </Text>
              </Pressable>
            </View>
          </DialGroup>

          <DialGroup label="Duration">
            <HorizontalDial
              min={0}
              max={1000}
              step={1}
              suffix="s"
              zeroLabel="∞"
              defaultValue={step.count ?? 0}
              onChange={(v) =>
                updateExerciseStepCount(exerciseId, stepId, Math.round(v))
              }
            />
          </DialGroup>

          <DialGroup label="Ramp" disabled={!step.count}>
            <HorizontalDial
              min={1}
              max={3}
              step={0.1}
              suffix="×"
              defaultValue={step.ramp ?? 1}
              onChange={(v) =>
                updateExerciseStepRamp(exerciseId, stepId, new Decimal(v).toDecimalPlaces(1).toNumber())
              }
            />
          </DialGroup>
        </View>
      </ScrollView>
    </AppSheet>
  );
};
