import { useEffect, useState } from "react";
import { Image, View, type ImageStyle, type StyleProp, type ViewStyle } from "react-native";
import { loadInstanceLogo, peekInstanceLogo } from "@/lib/mychart-instances";

type Props = {
  logoUrl: string;
  style: StyleProp<ImageStyle>;
  /** Rendered while loading and when the instance has no logo. */
  placeholderStyle: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * One provider's logo, fetched on demand and cached.
 *
 * Deliberately not `<Image source={{ uri }} />` straight at Epic. Those loads
 * bypass `scraperFetch` — no browser headers, no per-host permit — and a
 * FlatList flinging through 1400 rows would open as many connections to one
 * media host as the OS allows. Going through the scraper means the same permit
 * paces them, and the bytes land in SQLite so the second launch renders the
 * list without touching the network at all.
 *
 * A logo that fails to load is a blank square, never an error: the row is
 * still a provider the patient can connect to.
 */
export function InstanceLogo({ logoUrl, style, placeholderStyle, testID }: Props) {
  const [uri, setUri] = useState<string | null>(() => peekInstanceLogo(logoUrl) ?? null);

  useEffect(() => {
    // Already resolved (either bytes or a known miss) — no work, no flicker.
    const cached = peekInstanceLogo(logoUrl);
    if (cached !== undefined) {
      setUri(cached);
      return;
    }

    let active = true;
    setUri(null);
    loadInstanceLogo(logoUrl)
      .then((resolved) => {
        if (active) setUri(resolved);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [logoUrl]);

  if (!uri) {
    return <View testID={testID} style={[style, placeholderStyle]} />;
  }

  return (
    <Image testID={testID} source={{ uri }} style={style} resizeMode="contain" />
  );
}
