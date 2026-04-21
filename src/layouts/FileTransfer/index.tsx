import React, { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, Pressable, ActivityIndicator, ScrollView, Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import { SafeAreaView } from "react-native-safe-area-context";
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
import { Icon } from "../../components/Icon";
import tw from "../../utils/tw";
import { MusicFile } from "../../types/music";

type Status = "starting" | "running" | "no-wifi" | "error";

export const FileTransfer = () => {
  const navigation = useNavigation();
  const dispatch = useDispatch();
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
        const ip = netState.type === "wifi"
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
          setErrorMsg(err?.message || "Failed to start server");
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
    <View style={tw`flex-1 bg-black`}>
      <SafeAreaView style={tw`flex-1`}>
        {/* Header */}
        <View
          style={tw`flex-row px-4 pb-2 justify-between items-center border-b border-neutral-800`}
        >
          <Pressable
            style={tw`h-10 w-10 items-center justify-center active:opacity-80`}
            onPress={() => navigation.goBack()}
          >
            <Icon name="close" size={20} color="white" />
          </Pressable>
          <Text
            style={tw`text-sm font-inter font-medium text-neutral-200 uppercase tracking-widest`}
          >
            WiFi Transfer
          </Text>
          <View style={tw`h-10 w-10`} />
        </View>

        <ScrollView
          style={tw`flex-1`}
          contentContainerStyle={tw`px-6 pt-8 pb-8 items-center`}
        >
          {status === "starting" && (
            <View style={tw`items-center pt-16`}>
              <ActivityIndicator size="large" color="#6FE7FF" />
              <Text style={tw`text-sm font-inter text-neutral-400 mt-4`}>
                Starting server...
              </Text>
            </View>
          )}

          {status === "no-wifi" && (
            <View style={tw`items-center pt-16`}>
              <Icon name="wifi" size={48} color="#525252" />
              <Text
                style={tw`text-base font-inter text-neutral-400 mt-4 text-center`}
              >
                Connect to a WiFi network to use wireless file transfer.
              </Text>
            </View>
          )}

          {status === "error" && (
            <View style={tw`items-center pt-16`}>
              <Text style={tw`text-base font-inter text-red-400 text-center`}>
                {errorMsg}
              </Text>
            </View>
          )}

          {status === "running" && (
            <>
              <Text
                style={tw`text-sm font-inter text-neutral-400 text-center mb-6`}
              >
                Scan this QR code from another device on the same WiFi network
              </Text>

              <View
                style={[
                  tw`bg-white rounded-2xl p-4 items-center justify-center`,
                ]}
              >
                <QRCode value={url} size={200} color="#000000" />
              </View>

              <View style={tw`flex-row items-center mt-4 mb-8 gap-3`}>
                <Pressable
                  style={tw`flex-row items-center px-4 py-2 rounded-full border border-neutral-600 active:opacity-80`}
                  onPress={async () => {
                    await Clipboard.setStringAsync(url);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  <Icon name="clipboard" color={copied ? "#6FE7FF" : "white"} size={14} />
                  <Text style={[tw`ml-2 text-xs font-inter`, { color: copied ? "#6FE7FF" : "white" }]}>
                    {copied ? "Copied" : "Copy URL"}
                  </Text>
                </Pressable>
                <Pressable
                  style={tw`flex-row items-center px-4 py-2 rounded-full border border-neutral-600 active:opacity-80`}
                  onPress={() => Share.share({ message: url })}
                >
                  <Icon name="share" color="white" size={14} />
                  <Text style={tw`ml-1 text-xs font-inter text-white`}>
                    Share
                  </Text>
                </Pressable>
              </View>

              <Text
                style={[tw`text-xs font-inter mb-6`, { color: "#6FE7FF" }]}
                selectable
              >
                {url}
              </Text>

              {received.length > 0 && (
                <View style={tw`w-full`}>
                  <Text
                    style={tw`text-sm font-inter font-medium text-neutral-200 mb-3`}
                  >
                    Received Files
                  </Text>
                  {received.map((file) => (
                    <View
                      key={file.id}
                      style={tw`flex-row items-center py-3 border-b border-neutral-800`}
                    >
                      <Icon name="headphones" size={14} color="#6FE7FF" />
                      <Text
                        style={tw`text-sm font-inter text-neutral-300 ml-3 flex-1`}
                        numberOfLines={1}
                      >
                        {file.name}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};
