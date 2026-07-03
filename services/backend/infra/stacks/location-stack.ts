import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import * as location from "aws-cdk-lib/aws-location";
import type { Construct } from "constructs";

export interface LocationStackProps extends StackProps {
  stage: "dev" | "prod";
}

/**
 * API-Key für die Karten-Tiles (Amazon Location v2 „geo-maps").
 * Routing und Adresssuche laufen NICHT über diesen Key, sondern über die
 * Lambda-Proxys mit IAM-Rechten — der Key kann nur Karten laden.
 *
 * Den Key-Wert nach dem Deploy auslesen:
 *   aws location describe-key --key-name car-<stage>-maps --query Key --output text
 */
export class LocationStack extends Stack {
  constructor(scope: Construct, id: string, props: LocationStackProps) {
    super(scope, id, props);

    const key = new location.CfnAPIKey(this, "MapsApiKey", {
      keyName: `car-${props.stage}-maps`,
      noExpiry: true,
      restrictions: {
        allowActions: [
          "geo-maps:GetTile",
          "geo-maps:GetStaticMap",
          "geo-maps:GetStyleDescriptor",
          "geo-maps:GetSprites",
          "geo-maps:GetGlyphs",
        ],
        allowResources: [`arn:aws:geo-maps:${this.region}::provider/default`],
      },
    });

    new CfnOutput(this, "MapsApiKeyName", { value: key.keyName });
    new CfnOutput(this, "MapStyleUrlTemplate", {
      value: `https://maps.geo.${this.region}.amazonaws.com/v2/styles/Standard/descriptor?key=<KEY_VALUE>&color-scheme=Light`,
    });
  }
}
