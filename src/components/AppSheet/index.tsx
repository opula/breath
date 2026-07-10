import React, {
  ReactNode,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import {
  ModalBottomSheet,
  type Detent,
} from "@swmansion/react-native-bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import tw from "../../utils/tw";

export interface AppSheetHandle {
  dismiss: () => void;
}

interface AppSheetProps {
  children: ReactNode;
  /**
   * Snap points, ascending, starting with the closed detent. Defaults to
   * closed + content height.
   */
  detents?: Detent[];
  /** Runs after the sheet settles closed and its route has been popped. */
  onDismissed?: () => void;
}

/** Shared sheet chrome for every tray in the app. Hosts its content in a
 * native modal bottom sheet; the owning navigation route is a transparent,
 * non-animated card that pops once the sheet settles closed. */
export const AppSheet = forwardRef<AppSheetHandle, AppSheetProps>(
  ({ children, detents = [0, "content"], onDismissed }, ref) => {
    const navigation = useNavigation();
    const { bottom } = useSafeAreaInsets();
    const [index, setIndex] = useState(detents.length - 1);
    // Set once the sheet has settled closed and the route pop is ours.
    const settledClosed = useRef(false);

    const dismiss = useCallback(() => setIndex(0), []);
    useImperativeHandle(ref, () => ({ dismiss }), [dismiss]);

    const handleSettle = useCallback(
      (settledIndex: number) => {
        if (settledIndex !== 0 || settledClosed.current) return;
        settledClosed.current = true;
        navigation.goBack();
        onDismissed?.();
      },
      [navigation, onDismissed],
    );

    // Route removal from outside the sheet (Android back button, programmatic
    // goBack) closes the sheet first so it never vanishes without animating.
    useEffect(() => {
      return navigation.addListener("beforeRemove", (e) => {
        if (settledClosed.current) return;
        e.preventDefault();
        setIndex(0);
      });
    }, [navigation]);

    return (
      <ModalBottomSheet
        detents={detents}
        index={index}
        animateIn
        onIndexChange={setIndex}
        onSettle={handleSettle}
        scrimColor="rgba(0, 0, 0, 0.55)"
        surface={
          <View
            style={[
              StyleSheet.absoluteFill,
              tw`bg-mb-bg border-t border-mb-line rounded-t-3xl`,
            ]}
          />
        }
      >
        <View style={tw`justify-center items-center h-[40px] w-full`}>
          <View style={tw`h-1 w-10 bg-mb-dim rounded-full mt-3`} />
        </View>
        <View style={[tw`px-4`, { paddingBottom: bottom }]}>{children}</View>
      </ModalBottomSheet>
    );
  },
);
