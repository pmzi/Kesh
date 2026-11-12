import React, { useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';
import { Dot, PillButton, TextButton } from '../ui/bits';
import { useApp } from '../state/AppState';
import { NOT_REACHED, pillState, type SheetState } from '../state/connection';
import PairScreen from './PairScreen';

export default function ConnectionSheet({ sheet, onClose }: { sheet: SheetState | null; onClose: () => void }) {
  const app = useApp();
  const [page, setPage] = useState<SheetState['page']>('status');
  const [confirmForget, setConfirm] = useState(false);
  const wasConnected = useRef(false);

  useEffect(() => {
    if (sheet) {
      setPage(sheet.page);
      setConfirm(false);
      wasConnected.current = app.status === 'connected';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet]);

  // A successful pairing closes the sheet.
  useEffect(() => {
    if (sheet && page === 'pair' && app.status === 'connected') onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.status, page, sheet]);

  const pill = pillState(app);
  const mac = app.macName || 'your Mac';
  const connected = pill.kind === 'connected';

  let statusLine: string;
  if (connected) statusLine = `Connected to ${mac}.`;
  else if (!app.paired) statusLine = 'No Mac paired yet. Your plugins work without one.';
  else if (pill.kind === 'connecting') statusLine = `Connecting to ${mac}…`;
  else if (app.offlineByChoice) statusLine = 'Offline. You disconnected this Mac.';
  else statusLine = 'Offline. Your installed plugins still work.';
  const showError = app.paired && !connected && pill.kind !== 'connecting' && app.status === 'error' && !app.offlineByChoice;

  return (
    <Modal visible={!!sheet} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.bar}>
          <Text style={styles.barTitle}>CONNECTION</Text>
          <TextButton label="Close" onPress={onClose} />
        </View>
        {page === 'pair' ? (
          <PairScreen initialCode={sheet?.code} autoSubmit={sheet?.auto} onBack={() => setPage('status')} />
        ) : (
          <View style={styles.pad}>
            <View style={styles.statusRow}>
              <Dot color={connected ? colors.accent : colors.muted} />
              <Text style={styles.status} accessibilityRole="header">
                {statusLine}
              </Text>
            </View>
            {showError ? <Text style={styles.muted}>{NOT_REACHED}</Text> : null}

            <View style={styles.actions}>
              {app.paired && !connected && pill.kind !== 'connecting' ? (
                <PillButton label={`Connect to ${app.macName || 'Mac'}`} onPress={() => app.connect()} />
              ) : null}
              {connected ? <PillButton label="Disconnect" onPress={() => app.disconnect()} /> : null}
              {!app.paired ? (
                <PillButton label="Pair a new Mac" onPress={() => setPage('pair')} />
              ) : (
                <View style={styles.secondary}>
                  <TextButton accent label="Pair a new Mac" onPress={() => setPage('pair')} />
                </View>
              )}
              {app.paired && !connected && pill.kind === 'connecting' ? (
                <View style={styles.secondary}>
                  <TextButton label="Disconnect" onPress={() => app.disconnect()} />
                </View>
              ) : null}
              {app.paired ? (
                confirmForget ? (
                  <View style={styles.confirm}>
                    <Text style={styles.muted}>This phone will forget {mac} and need to pair again. Installed plugins stay.</Text>
                    <View style={styles.confirmRow}>
                      <TextButton label="Cancel" onPress={() => setConfirm(false)} />
                      <TextButton
                        accent
                        label="Forget"
                        onPress={async () => {
                          await app.forgetMac();
                          setConfirm(false);
                        }}
                      />
                    </View>
                  </View>
                ) : (
                  <View style={styles.secondary}>
                    <TextButton label="Forget this Mac" onPress={() => setConfirm(true)} />
                  </View>
                )
              ) : null}
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 56, paddingHorizontal: 28 },
  barTitle: { color: colors.text, fontSize: 13, fontWeight: '600', letterSpacing: 1.2 },
  pad: { paddingHorizontal: 28, paddingTop: 16 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  status: { flex: 1, color: colors.text, fontFamily: fonts.ui, fontSize: 20, fontWeight: '600', lineHeight: 26 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 12 },
  actions: { marginTop: 32, gap: 8 },
  secondary: { alignItems: 'center', marginTop: 8 },
  confirm: { marginTop: 8 },
  confirmRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
});
