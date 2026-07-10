import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Share,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import NetInfo from "@react-native-community/netinfo";
import QRCode from "react-native-qrcode-skia";
import { ConfigServer } from "react-native-nitro-http-server";
import { useDispatch } from "react-redux";
import { addFile } from "../../state/musicLibrary.reducer";
import {
  startFileTransferServer,
  stopFileTransferServer,
} from "../../services/FileTransferServer";
import tw from "../../utils/tw";
import { NavHeader } from "../../components/NavHeader";
import { MusicFile } from "../../types/music";
import { Overline } from "../../components/Overline";
import { BigTitle } from "../../components/BigTitle";

type Status = "starting" | "running" | "no-wifi" | "error";

export const FileTransfer = () => {
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();
  const serverRef = useRef<ConfigServer | null>(null);
  const [status, setStatus] = useState<Status>("starting");
  const [url, setUrl] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [received, setReceived] = useState<MusicFile[]>([]);
  const [copied, setCopied] = useState(false);

  const onFileReceived = useCallback(
    (file: MusicFile) => {
      dispatch(addFile(file));
      setReceived((prev) => [file, ...prev]);
    },
    [dispatch],
  );

  useEffect(() => {
    let stopped = false;

    async function init() {
      try {
        const netState = await NetInfo.fetch();
        const ip =
          netState.type === "wifi"
            ? (netState as any).details?.ipAddress
            : null;

        if (!ip) {
          setStatus("no-wifi");
          return;
        }

        if (stopped) return;

        const server = await startFileTransferServer({
          callbacks: { onFileReceived },
        });
        if (stopped) {
          await stopFileTransferServer(server);
          return;
        }

        serverRef.current = server;
        const serverUrl = `http://${ip}:8080`;
        setUrl(serverUrl);
        setStatus("running");
      } catch (err: any) {
        if (!stopped) {
          setErrorMsg(err?.message || "Couldn't start the transfer");
          setStatus("error");
        }
      }
    }

    init();

    return () => {
      stopped = true;
      if (serverRef.current) {
        stopFileTransferServer(serverRef.current);
        serverRef.current = null;
      }
    };
  }, [onFileReceived]);

  return (
    <View style={tw`flex-1 bg-mb-bg`}>
      <View style={[tw`flex-1`, { paddingTop: insets.top }]}>
        {/* Top nav */}
        <NavHeader title="wifi transfer" onClose={() => navigation.goBack()} />

        <ScrollView
          contentContainerStyle={tw`px-6 pb-10`}
          showsVerticalScrollIndicator={false}
        >
          <Overline
            accent
            right={
              status === "running"
                ? "live"
                : status === "no-wifi"
                  ? "no wifi"
                  : status
            }
          >
            Transfer
          </Overline>
          <View style={tw`mt-5 mb-6`}>
            <BigTitle size={40} accent>{`Drop\nfiles in`}</BigTitle>
          </View>

          {status === "starting" && (
            <View style={tw`items-center pt-10`}>
              <ActivityIndicator size="large" color="#6FE7FF" />
              <Text
                style={[
                  tw`font-mono text-[10px] text-mb-mute uppercase mt-4`,
                  { letterSpacing: 2 },
                ]}
              >
                starting
              </Text>
            </View>
          )}

          {status === "no-wifi" && (
            <View style={tw`items-center pt-10`}>
              <Text
                style={[
                  tw`font-item text-[18px] text-mb-ink text-center`,
                ]}
              >
                WiFi required
              </Text>
              <Text
                style={[
                  tw`font-mono text-[10px] text-mb-mute uppercase text-center mt-3`,
                  { letterSpacing: 2 },
                ]}
              >
                connect to a network to use transfer
              </Text>
            </View>
          )}

          {status === "error" && (
            <View style={tw`items-center pt-10`}>
              <Text
                style={[
                  tw`font-item text-[18px] text-mb-warn text-center`,
                ]}
              >
                Transfer error
              </Text>
              <Text
                style={tw`font-inter text-sm text-mb-mute text-center mt-3`}
              >
                {errorMsg}
              </Text>
            </View>
          )}

          {status === "running" && (
            <>
              <Text
                style={[
                  tw`font-mono text-[10px] text-mb-mute uppercase mb-5`,
                  { letterSpacing: 2 },
                ]}
              >
                scan from any device on the same WiFi
              </Text>

              <View style={tw`items-center`}>
                <View style={tw`bg-white rounded-2xl p-4`}>
                  <QRCode value={url} size={200} color="#000000" />
                </View>
              </View>

              <View style={tw`flex-row justify-center mt-6 mb-6 gap-3`}>
                <Pressable
                  onPress={async () => {
                    await Clipboard.setStringAsync(url);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  style={({ pressed }) => [
                    tw`px-4 py-2 border border-mb-line`,
                    pressed && tw`opacity-70`,
                  ]}
                >
                  <Text
                    style={[
                      tw`font-mono text-[10px] uppercase`,
                      copied ? tw`text-mb-accent` : tw`text-mb-ink`,
                      { letterSpacing: 2 },
                    ]}
                  >
                    {copied ? "copied" : "copy url"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => Share.share({ message: url })}
                  style={({ pressed }) => [
                    tw`px-4 py-2 border border-mb-line`,
                    pressed && tw`opacity-70`,
                  ]}
                >
                  <Text
                    style={[
                      tw`font-mono text-[10px] text-mb-ink uppercase`,
                      { letterSpacing: 2 },
                    ]}
                  >
                    share
                  </Text>
                </Pressable>
              </View>

              <Text
                selectable
                style={[
                  tw`font-mono text-mb-accent text-[11px] text-center mb-8`,
                  { letterSpacing: 1.5 },
                ]}
              >
                {url}
              </Text>

              {received.length > 0 && (
                <View>
                  <Overline right={`${received.length} received`}>
                    Incoming
                  </Overline>
                  {received.map((file, i) => (
                    <View
                      key={file.id}
                      style={tw`flex-row items-center py-3 border-b border-mb-line`}
                    >
                      <Text
                        style={[
                          tw`font-mono text-[10px] text-mb-accent w-8`,
                          { letterSpacing: 1.5 },
                        ]}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </Text>
                      <Text
                        style={[
                          tw`font-item text-[16px] text-mb-ink flex-1`,
                        ]}
                        numberOfLines={1}
                      >
                        {file.name.replace(/\.[^.]+$/, "")}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </View>
  );
};
