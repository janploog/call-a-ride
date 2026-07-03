import { Camera, Map as MapLibreMap, Marker } from "@maplibre/maplibre-react-native";
import type { Coordinate } from "@call-a-ride/core";
import { StyleSheet, Text, View } from "react-native";
import { config } from "../config";
import { colors } from "../ui";

interface RideMapProps {
  pickup: Coordinate;
  dropoff?: Coordinate | null;
}

/**
 * Karte mit Amazon-Location-Tiles (MapLibre). Benötigt einen Dev-Build
 * (`npx expo run:ios|android`) — in Expo Go ist das native Modul nicht enthalten.
 */
export function RideMap({ pickup, dropoff }: RideMapProps) {
  if (!config.mapStyleUrl) {
    return (
      <View style={[mapStyles.map, mapStyles.placeholder]}>
        <Text style={mapStyles.placeholderText}>
          Karte nicht konfiguriert – EXPO_PUBLIC_MAP_STYLE_URL in .env setzen.
        </Text>
      </View>
    );
  }

  const center = dropoff
    ? { lat: (pickup.lat + dropoff.lat) / 2, lon: (pickup.lon + dropoff.lon) / 2 }
    : pickup;

  return (
    <MapLibreMap style={mapStyles.map} mapStyle={config.mapStyleUrl}>
      <Camera
        center={[center.lon, center.lat]}
        zoom={dropoff ? 11 : 14}
        duration={300}
      />
      <Marker id="pickup" lngLat={[pickup.lon, pickup.lat]}>
        <View style={[mapStyles.marker, { backgroundColor: colors.primary }]} />
      </Marker>
      {dropoff ? (
        <Marker id="dropoff" lngLat={[dropoff.lon, dropoff.lat]}>
          <View style={[mapStyles.marker, { backgroundColor: colors.success }]} />
        </Marker>
      ) : null}
    </MapLibreMap>
  );
}

const mapStyles = StyleSheet.create({
  map: {
    height: 260,
    borderRadius: 12,
    overflow: "hidden",
  },
  placeholder: {
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  placeholderText: {
    color: colors.muted,
    textAlign: "center",
  },
  marker: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: "#ffffff",
  },
});
