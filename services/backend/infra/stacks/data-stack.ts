import { Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";

export interface DataStackProps extends StackProps {
  stage: "dev" | "prod";
}

export class DataStack extends Stack {
  readonly usersTable: dynamodb.Table;
  readonly ridesTable: dynamodb.Table;
  readonly driverLocationsTable: dynamodb.Table;
  readonly connectionsTable: dynamodb.Table;
  readonly configTable: dynamodb.Table;
  /** Fahrer-Dokumente (Führerschein, P-Schein, …) – privat, nur presigned URLs */
  readonly documentsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const removalPolicy =
      props.stage === "prod" ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;
    const common = {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: props.stage === "prod",
      },
    } satisfies Partial<dynamodb.TableProps>;

    this.usersTable = new dynamodb.Table(this, "Users", {
      ...common,
      tableName: `car-${props.stage}-users`,
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
    });
    // Für account.updated-Webhooks von Stripe Connect
    this.usersTable.addGlobalSecondaryIndex({
      indexName: "byStripeAccount",
      partitionKey: { name: "stripeAccountId", type: dynamodb.AttributeType.STRING },
    });
    // Verifizierungsqueue im Admin-Dashboard
    this.usersTable.addGlobalSecondaryIndex({
      indexName: "byVerificationStatus",
      partitionKey: { name: "verificationStatus", type: dynamodb.AttributeType.STRING },
    });

    this.ridesTable = new dynamodb.Table(this, "Rides", {
      ...common,
      tableName: `car-${props.stage}-rides`,
      partitionKey: { name: "rideId", type: dynamodb.AttributeType.STRING },
    });
    this.ridesTable.addGlobalSecondaryIndex({
      indexName: "byRider",
      partitionKey: { name: "riderId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: dynamodb.AttributeType.STRING },
    });
    this.ridesTable.addGlobalSecondaryIndex({
      indexName: "byDriver",
      partitionKey: { name: "driverId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: dynamodb.AttributeType.STRING },
    });
    this.ridesTable.addGlobalSecondaryIndex({
      indexName: "byStatus",
      partitionKey: { name: "status", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: dynamodb.AttributeType.STRING },
    });
    // Chronologische Gesamtliste fürs Admin-Dashboard (entityType ist konstant "RIDE")
    this.ridesTable.addGlobalSecondaryIndex({
      indexName: "byDate",
      partitionKey: { name: "entityType", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: dynamodb.AttributeType.STRING },
    });

    this.driverLocationsTable = new dynamodb.Table(this, "DriverLocations", {
      ...common,
      tableName: `car-${props.stage}-driver-locations`,
      partitionKey: { name: "geohash", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "driverId", type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: "expiresAt",
    });
    // Zum Aufräumen alter Zelleinträge nach einem Geohash-Wechsel
    this.driverLocationsTable.addGlobalSecondaryIndex({
      indexName: "byDriver",
      partitionKey: { name: "driverId", type: dynamodb.AttributeType.STRING },
    });

    this.connectionsTable = new dynamodb.Table(this, "Connections", {
      ...common,
      tableName: `car-${props.stage}-connections`,
      partitionKey: { name: "connectionId", type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: "expiresAt",
    });
    this.connectionsTable.addGlobalSecondaryIndex({
      indexName: "byUser",
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
    });

    this.configTable = new dynamodb.Table(this, "Config", {
      ...common,
      tableName: `car-${props.stage}-config`,
      partitionKey: { name: "configKey", type: dynamodb.AttributeType.STRING },
    });

    this.documentsBucket = new s3.Bucket(this, "DriverDocuments", {
      bucketName: `car-${props.stage}-driver-documents-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: props.stage === "prod",
      removalPolicy,
      autoDeleteObjects: props.stage !== "prod",
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
          maxAge: Duration.hours(1).toSeconds(),
        },
      ],
    });
  }
}
