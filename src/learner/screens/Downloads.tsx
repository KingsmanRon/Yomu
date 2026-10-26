"use client";

import { useEffect, useState } from "react";
import type { LessonPack } from "@/lib/content/compiled";
import { track } from "../analytics";
import { useConnection } from "../offline/network";
import { downloadPack, downloadedPacks, fetchPack, formatBytes, removePack, storageUse, type DownloadedPack } from "../offline/packs";
import { navigate } from "../router";
import { useLearner } from "../state";
import { IconBin, IconCheck, IconDownload, IconMobileData, IconWifi } from "../ui/icons";
import { Caption, ListenButton, Screen, Spinner, TopBar } from "../ui/kit";
import { useSpeakOnMount, useSpeech } from "../ui/speech";

/**
 * Lesson packs by unit: the size is shown before downloading, mobile data use
 * is flagged, and "Wi-Fi only" is respected.
 */
export function Downloads() {
  const { db, lang, line, catalog, profile } = useLearner();
  const { speak } = useSpeech();
  const connection = useConnection();
  const [packs, setPacks] = useState<Record<string, LessonPack>>({});
  const [have, setHave] = useState<Record<string, DownloadedPack>>({});
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  useSpeakOnMount(lang ? [{ line: line("downloads.intro"), lang }] : null, [lang]);

  // Bumped to re-read what is on the phone after a download or removal.
  const [version, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);

  useEffect(() => {
    if (!db || !lang) return;
    let cancelled = false;
    Promise.all([downloadedPacks(db, lang), storageUse()]).then(([h, u]) => {
      if (cancelled) return;
      setHave(h);
      setUsage(u);
    });
    return () => {
      cancelled = true;
    };
  }, [db, lang, version]);

  useEffect(() => {
    if (!lang || !catalog || connection === "offline") return;
    let cancelled = false;
    for (const u of catalog.units) {
      fetchPack(lang, u.id)
        .then((p) => !cancelled && setPacks((all) => ({ ...all, [u.id]: p })))
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [lang, catalog, connection]);

  if (!lang || !catalog || !db || !profile) return <Spinner />;
  const wifiOnlyBlocks = profile.settings.wifiOnly && connection === "mobile";

  const download = async (unit: string) => {
    const pack = packs[unit];
    if (!pack) return;
    if (wifiOnlyBlocks) {
      await speak({ line: line("sys.waiting_wifi"), lang });
      return;
    }
    if (connection === "mobile") void speak({ line: line("sys.uses_data"), lang });
    setProgress((p) => ({ ...p, [unit]: 0 }));
    try {
      await downloadPack(db, pack, (done, total) => setProgress((p) => ({ ...p, [unit]: done / total })));
      void track("pack_download", { unit, kb: Math.round(pack.bytes / 1024), connection }, profile.id);
      await speak({ line: line("downloads.done"), lang });
    } catch {
      await speak({ line: line("sys.error_generic"), lang });
    } finally {
      setProgress((p) => {
        const { [unit]: _, ...rest } = p;
        void _;
        return rest;
      });
      refresh();
    }
  };

  return (
    <Screen label="downloads">
      <TopBar onBack={() => navigate("/me")} onListen={() => void speak({ line: line("downloads.intro"), lang })} />
      <Caption line={line("downloads.intro")} />
      <div className="my-3 flex items-center gap-2 rounded-2xl bg-white p-3 text-ink-soft">
        {connection === "mobile" ? <IconMobileData size={28} className="text-accent" /> : <IconWifi size={28} className="text-primary" />}
        {profile.settings.wifiOnly && <span className="text-sm font-semibold">Wi-Fi only</span>}
      </div>
      <ul className="flex flex-col gap-3">
        {catalog.units
          .filter((u) => catalog.lessons.some((l) => l.unit === u.id && l.available[lang]))
          .map((u) => {
            const pack = packs[u.id];
            const got = have[u.id];
            const p = progress[u.id];
            const size = pack?.bytes ?? catalog.lessons.filter((l) => l.unit === u.id).reduce((n, l) => n + l.bytes[lang], 0);
            return (
              <li key={u.id} className="flex items-center gap-3 rounded-2xl bg-white p-3" data-testid={`pack-${u.id}`}>
                <ListenButton size="sm" onListen={() => void speak({ line: u.title[lang], lang })} />
                <div className="flex flex-1 flex-col">
                  <span className="font-bold">{u.title[lang].label}</span>
                  <span className="text-sm text-ink-soft" data-testid="pack-size">
                    {formatBytes(size)}
                  </span>
                  {p !== undefined && (
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-line">
                      <div className="h-full bg-primary" style={{ width: `${Math.round(p * 100)}%` }} />
                    </div>
                  )}
                </div>
                {got ? (
                  <>
                    <IconCheck size={28} className="text-good" />
                    <button
                      type="button"
                      data-testid="pack-remove"
                      aria-label={line("downloads.remove")?.label ?? "remove"}
                      onClick={async () => {
                        await removePack(db, lang, u.id);
                        refresh();
                      }}
                      className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-line text-ink-soft"
                    >
                      <IconBin size={24} />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    data-testid="pack-download"
                    aria-label={line("downloads.download")?.label ?? "download"}
                    disabled={!pack || connection === "offline" || p !== undefined}
                    onClick={() => void download(u.id)}
                    className={`flex h-12 w-12 items-center justify-center rounded-full text-white disabled:opacity-40 ${wifiOnlyBlocks ? "bg-line" : "bg-primary"}`}
                  >
                    <IconDownload size={24} />
                  </button>
                )}
              </li>
            );
          })}
      </ul>
      {usage && (
        <p className="mt-4 text-center text-sm text-ink-soft" data-testid="storage-use">
          {formatBytes(usage.used)}
        </p>
      )}
    </Screen>
  );
}
