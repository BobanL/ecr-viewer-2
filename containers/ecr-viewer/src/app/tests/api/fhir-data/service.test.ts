/**
 * @jest-environment node
 */
import { S3ServiceException } from "@aws-sdk/client-s3";
import { BlobServiceClient } from "@azure/storage-blob";
import { ApiError } from "@google-cloud/storage";

import {
  get_azure,
  get_fhir_data,
  get_s3,
} from "@/app/api/fhir-data/fhir-data-service";
import { AZURE_SOURCE, GCP_SOURCE, S3_SOURCE } from "@/app/api/utils";
import { gcpClient } from "@/app/data/blobStorage/gcpClient";
import { s3Client } from "@/app/data/blobStorage/s3Client";

jest.mock("../../../data/blobStorage/s3Client");
jest.mock("../../../data/blobStorage/gcpClient", () => ({
  gcpClient: jest.fn(),
}));
jest.mock("@azure/storage-blob", () => ({
  BlobServiceClient: {
    fromConnectionString: jest.fn(),
  },
}));

jest.mock("../../../api/utils", () => {
  const originalModule = jest.requireActual("../../../api/utils");
  return {
    ...originalModule,
    streamToJson: (body: string) => body,
  };
});

const defaultFhirBundle = "hi";
const simpleResponse = {
  fhirBundle: defaultFhirBundle,
};

describe("get_fhir_data", () => {
  afterEach(() => {
    process.env.SOURCE = S3_SOURCE;
    jest.resetAllMocks();
  });

  it("should return a 500 response when METADATA_DATABASE_TYPE is invalid", async () => {
    (process.env.SOURCE as any) = "p0$+gre$";

    const response = await get_fhir_data("123");

    jest.spyOn(console, "error").mockImplementation();
    expect(response.status).toEqual(500);
    expect(await response.json()).toEqual({
      message: "Invalid source",
    });
  });

  describe("gcp", () => {
    beforeEach(() => {
      process.env.SOURCE = GCP_SOURCE;
      process.env.ECR_BUCKET_NAME = "ecr-viewer-files";
    });
    afterAll(() => {
      process.env.ECR_BUCKET_NAME = "";
    });

    it("should return 200 when the file is found", async () => {
      jest.spyOn(console, "error").mockImplementation(() => {});
      (gcpClient as jest.Mock).mockReturnValue({
        file: () => ({ download: () => "Some text" }),
      });

      const response = await get_fhir_data("1234");

      expect(await response.json()).toEqual({ fhirBundle: "Some text" });
      expect(response.status).toEqual(200);
    });

    it("should return 404 when file not found", async () => {
      jest.spyOn(console, "error").mockImplementation(() => {});
      (gcpClient as jest.Mock).mockReturnValue({
        file: () => ({
          download: () =>
            Promise.reject(
              new ApiError({
                code: 404,
              } as any),
            ),
        }),
      });

      const response = await get_fhir_data("1234");

      expect(await response.json()).toEqual({ message: "eCR ID not found" });
      expect(response.status).toEqual(404);
    });

    it("should return 500 when an error is thrown", async () => {
      jest.spyOn(console, "error").mockImplementation(() => {});
      (gcpClient as jest.Mock).mockReturnValue({
        file: () => ({
          download: () => Promise.reject(new Error("Something went wrong!")),
        }),
      });

      const response = await get_fhir_data("1234");

      expect(await response.json()).toEqual({
        message: "Something went wrong!",
      });
      expect(response.status).toEqual(500);
    });

    it("should return 500 when a string is thrown", async () => {
      jest.spyOn(console, "error").mockImplementation(() => {});
      (gcpClient as jest.Mock).mockReturnValue({
        file: () => ({
          download: () => Promise.reject("Uh oh :|"),
        }),
      });

      const response = await get_fhir_data("1234");

      expect(await response.json()).toEqual({
        message: "Internal Server Error.",
      });
      expect(response.status).toEqual(500);
    });

    it("should return 500 ECR_BUCKET_NAME is not set", async () => {
      process.env.ECR_BUCKET_NAME = "";
      jest.spyOn(console, "error").mockImplementation(() => {});

      const response = await get_fhir_data("1234");

      expect(await response.json()).toEqual({
        message: "Failed to download the FHIR data due to misconfiguration.",
      });
      expect(response.status).toEqual(500);
    });
  });
});

describe("get_s3", () => {
  afterEach(() => {
    process.env.SOURCE = S3_SOURCE;
    jest.resetAllMocks();
  });

  it("should return ecr when database query succeeds", async () => {
    s3Client.send = jest.fn().mockReturnValue({ Body: defaultFhirBundle });
    const response = await get_s3("123");

    expect(response.status).toEqual(200);
    expect(response.payload).toEqual({
      fhirBundle: defaultFhirBundle,
    });
    expect(s3Client.send).toHaveBeenCalledTimes(1);
  });

  it("should be called by get_fhir_data when source is S3", async () => {
    process.env.SOURCE = S3_SOURCE;
    s3Client.send = jest.fn().mockReturnValue({ Body: defaultFhirBundle });
    const response = await get_fhir_data("123");

    expect(response.status).toEqual(200);
    expect(await response.json()).toEqual(simpleResponse);
    expect(s3Client.send).toHaveBeenCalledTimes(1);
  });

  it("should return a 404 error response when id is unknown", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});

    s3Client.send = jest.fn().mockImplementation(async () => {
      throw new S3ServiceException({
        name: "NoSuchKey",
        message: "No such Key",
        $fault: "server",
        $metadata: {},
      });
    });
    const response = await get_s3("123");
    expect(response.status).toEqual(404);
    expect(response.payload).toEqual({ message: "eCR ID not found" });
    expect(s3Client.send).toHaveBeenCalledTimes(1);
  });

  it("should return a 500 error response when an unexpected error occurs", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});

    s3Client.send = jest.fn().mockImplementation(async () => {
      throw new S3ServiceException({
        name: "Something else",
        message: "Oh no!",
        $fault: "server",
        $metadata: {},
      });
    });
    const response = await get_s3("123");
    expect(response.status).toEqual(500);
    expect(response.payload).toEqual({ message: "Oh no!" });
    expect(s3Client.send).toHaveBeenCalledTimes(1);
  });

  it("should return a 500 error response when error is not an S3ServiceException", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});

    s3Client.send = jest.fn().mockImplementation(async () => {
      throw new Error("test error");
    });
    const response = await get_s3("123");
    expect(response.status).toEqual(500);
    expect(response.payload).toEqual({ message: "test error" });
    expect(s3Client.send).toHaveBeenCalledTimes(1);
  });
});

describe("get_azure", () => {
  const blockBlobClient = {
    download: jest.fn(),
  };

  beforeEach(() => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = "connection";
    const containerClient = {
      getBlobClient: jest.fn().mockReturnValue(blockBlobClient),
    };

    const blobClient = {
      getContainerClient: jest.fn().mockReturnValue(containerClient),
    };

    (BlobServiceClient.fromConnectionString as jest.Mock).mockReturnValue(
      blobClient,
    );
  });

  afterEach(() => {
    process.env.SOURCE = S3_SOURCE;
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;
    jest.resetAllMocks();
  });

  it("should return ecr when database query succeeds", async () => {
    blockBlobClient.download = jest
      .fn()
      .mockReturnValue({ readableStreamBody: defaultFhirBundle });
    const response = await get_azure("123");

    expect(response.status).toEqual(200);
    expect(response.payload).toEqual({
      fhirBundle: defaultFhirBundle,
    });
    expect(blockBlobClient.download).toHaveBeenCalledTimes(1);
  });

  it("should be called by get_fhir_data when source is azure", async () => {
    process.env.SOURCE = AZURE_SOURCE;
    blockBlobClient.download = jest
      .fn()
      .mockReturnValue({ readableStreamBody: defaultFhirBundle });
    const response = await get_fhir_data("123");

    expect(response.status).toEqual(200);
    expect(await response.json()).toEqual(simpleResponse);
    expect(blockBlobClient.download).toHaveBeenCalledTimes(1);
  });

  it("should return a 404 error response when id unknown", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});

    blockBlobClient.download = jest.fn().mockImplementation(async () => {
      throw { statusCode: 404, code: "ResourceNotFound" };
    });
    const response = await get_azure("123");
    expect(response.status).toEqual(404);
    expect(response.payload).toEqual({ message: "eCR ID not found" });
    expect(blockBlobClient.download).toHaveBeenCalledTimes(1);
  });

  it("should return a 500 error response when database query fails", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});

    blockBlobClient.download = jest.fn().mockImplementation(async () => {
      throw { statusCode: 409, message: "Oh no!" };
    });
    const response = await get_azure("123");
    expect(response.status).toEqual(500);
    expect(response.payload).toEqual({ message: "Oh no!" });
    expect(blockBlobClient.download).toHaveBeenCalledTimes(1);
  });

  it("should return a 500 error response when azure is not setup", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});

    blockBlobClient.download = jest.fn().mockImplementation(async () => {
      throw { statusCode: 409, message: "Oh no!" };
    });
    const response = await get_azure("123");
    expect(response.status).toEqual(500);
    expect(response.payload).toEqual({ message: "Oh no!" });
    expect(blockBlobClient.download).toHaveBeenCalledTimes(1);
  });
  it("should return a 500 error response when AZURE_STORAGE_CONNECTION_STRING is missing", async () => {
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;
    blockBlobClient.download = jest.fn().mockImplementation(async () => {
      throw { statusCode: 409, message: "Oh no!" };
    });
    const response = await get_azure("123");
    expect(response.status).toEqual(500);
    expect(response.payload).toEqual({
      message:
        "Failed to download the FHIR data due to misconfiguration of client.",
    });
  });
});
