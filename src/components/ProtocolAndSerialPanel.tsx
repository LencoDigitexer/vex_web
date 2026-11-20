import React, { useState } from 'react';
import { Send, Terminal, Usb, Wifi } from 'lucide-react';
import { Vex5Packet, formatHexFrame } from '../lib/vex5Protocol';

interface ProtocolAndSerialPanelProps {
  packets: Vex5Packet[];
  serialLogs: string[];
  hwVersion: 0 | 5;
  onChangeHwVersion: (ver: 0 | 5) => void;
  onSendSerialCommand: (cmd: string) => void;
  onClearPackets: () => void;
  onClearSerial: () => void;
  serialConnected: boolean;
  onToggleWebSerial: () => void;
  webSerialSupported: boolean;
}

export const ProtocolAndSerialPanel: React.FC<ProtocolAndSerialPanelProps> = ({
  packets,
  serialLogs,
  hwVersion,
  onChangeHwVersion,
  onSendSerialCommand,
  onClearPackets,
  onClearSerial,
  serialConnected,
  onToggleWebSerial,
  webSerialSupported,
}) => {
  const [commandInput, setCommandInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim()) return;
    onSendSerialCommand(commandInput.trim());
    setCommandInput('');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Vex5_InternalProtocol Frame Inspector */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              Vex5_InternalProtocol SPI Frame Inspector
            </h2>
            <p className="text-xs text-slate-400">
              Marker 0xC0 · Len+2 · DevID · Cmd · Payload · CRC-16 CCITT
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={hwVersion}
              onChange={(e) => onChangeHwVersion(Number(e.target.value) as 0 | 5)}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
              aria-label="Shield Hardware Version"
            >
              <option value={5}>Shield HW v5</option>
              <option value={0}>Shield HW v0</option>
            </select>
            <button
              type="button"
              onClick={onClearPackets}
              className="px-2 py-1 text-xs rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-56 max-h-72 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 p-2.5 space-y-2 font-mono text-xs">
          {packets.length === 0 ? (
            <div className="text-slate-500 text-center py-10">
              Issue a motor or sensor command to inspect generated SPI frames.
            </div>
          ) : (
            packets.map((pkt) => (
              <div
                key={pkt.id}
                className="rounded border border-slate-800/80 bg-slate-900/80 p-2 space-y-1"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-sky-400 font-semibold">{pkt.cmdName}</span>
                  <span className="text-slate-400">
                    Port {pkt.port} → ID:{pkt.devId} / RealP:{pkt.realPort} · CRC 0x
                    {pkt.crc16.toString(16).toUpperCase().padStart(4, '0')}
                  </span>
                </div>
                <div className="text-[11px] text-emerald-400 break-all">
                  {formatHexFrame(pkt.rawFrame)}
                </div>
                <div className="text-[11px] text-slate-400">{pkt.summary}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ESP32 Wi-Fi POISK_LAN <-> Mega2560 Serial2 Console */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-amber-400" />
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                ESP32 (POISK_LAN) ↔ Mega2560 Serial2 Console (115200)
              </h2>
              <p className="text-xs text-slate-400">
                Поток телеметрии VexV5 и команды на Mega2560 по Wi-Fi
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleWebSerial}
              disabled={!webSerialSupported}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border transition-colors ${
                serialConnected
                  ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                  : webSerialSupported
                    ? 'border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200'
                    : 'border-slate-800 bg-slate-900 text-slate-500 cursor-not-allowed'
              }`}
              title="Опциональное прямое USB Serial подключение к Mega2560 с ПК"
            >
              {serialConnected ? <Wifi className="w-3.5 h-3.5" /> : <Usb className="w-3.5 h-3.5" />}
              {serialConnected ? 'Disconnect USB' : 'PC USB Serial'}
            </button>
            <button
              type="button"
              onClick={onClearSerial}
              className="px-2 py-1 text-xs rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-48 max-h-60 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 p-2.5 font-mono text-[11px] space-y-1 text-slate-300">
          {serialLogs.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">
              {line}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="mt-2.5 flex gap-2">
          <input
            type="text"
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            placeholder="Command: help | speed 200 200 | pos left 90 200 | stop | reset both | led 1"
            className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-medium text-white"
          >
            <Send className="w-3.5 h-3.5" />
            Send
          </button>
        </form>
      </div>
    </div>
  );
};
