import { Bundle } from "fhir/r4";

import BundleEcrMetadata from "../../../../../../test-data/fhir/BundleEcrMetadata.json";
import BundlePatient from "../../../../../../test-data/fhir/BundlePatient.json";
import BundlePatientMultiple from "../../../../../../test-data/fhir/BundlePatientMultiple.json";
import BundlePractitionerRole from "../../../../../../test-data/fhir/BundlePractitionerRole.json";
import {
  evaluateEncounterId,
  evaluateFacilityId,
  evaluatePatientRace,
  evaluatePatientEthnicity,
  evaluatePractitionerRoleReference,
  evaluatePatientAddress,
  evaluatePatientName,
  evaluateDemographicsData,
  evaluateEncounterCareTeamTable,
  evaluateAlcoholUse,
  evaluatePatientLanguage,
  evaluatePatientVitalStatus,
  censorGender,
} from "@/app/services/evaluateFhirDataService";
import { evaluateValue } from "@/app/utils/evaluate";
import mappings from "@/app/utils/evaluate/fhir-paths";

describe("evaluateFhirDataServices tests", () => {
  describe("Evaluate Identifier", () => {
    it("should return the Identifier value", () => {
      const actual = evaluateValue(
        BundlePatient as unknown as Bundle,
        mappings.patientIds,
      );

      expect(actual).toEqual("1234567890");
    });
  });

  describe("Evaluate Patient Race", () => {
    it("should return race category and extension if available", () => {
      const actual = evaluatePatientRace(BundlePatient as unknown as Bundle);
      expect(actual).toEqual("Black or African American\nAfrican");
    });
  });

  describe("Evaluate Patient Ethnicity", () => {
    it("should return ethnicity category and extension if available", () => {
      const actual = evaluatePatientEthnicity(
        BundlePatient as unknown as Bundle,
      );
      expect(actual).toEqual("Hispanic or Latino\nWhite");
    });
  });

  it("should return tribal affiliation if available", () => {
    const actual = evaluateDemographicsData(BundlePatient as unknown as Bundle);
    const ext = actual.availableData.filter(
      (d) => d.title === "Tribal Affiliation",
    );
    expect(ext).toHaveLength(1);
    expect(ext[0].value).toEqual(
      "Fort Mojave Indian Tribe of Arizona, California",
    );
  });

  it("should return parent/guardian if available", () => {
    const actual = evaluateDemographicsData(BundlePatient as unknown as Bundle);
    const ext = actual.availableData.filter(
      (d) => d.title === "Parent/Guardian",
    );
    expect(ext).toHaveLength(1);
    expect(ext[0].value).toEqual(
      `Grandparent
Luthen Rael
Home:
1357 Galactic Drive
Sometown, OR
94949, US

Work:
123 Galactic Drive
Sometown, OR
94949, US
Home: 123-456-6909`,
    );
  });

  describe("Evaluate Facility Id", () => {
    it("should return the facility id", () => {
      const actual = evaluateFacilityId(BundleEcrMetadata as unknown as Bundle);

      expect(actual).toEqual("112233445566778899");
    });
  });

  describe("Evaluate Encounter ID", () => {
    it("should return the correct Encounter ID", () => {
      const actual = evaluateEncounterId(
        BundleEcrMetadata as unknown as Bundle,
      );

      expect(actual).toEqual("123456789");
    });
  });

  describe("Evaluate Encounter Care Team", () => {
    it("should return the correct Encounter care team", () => {
      const actual = evaluateEncounterCareTeamTable(
        BundleEcrMetadata as unknown as Bundle,
      );

      expect(actual).toMatchSnapshot();
    });
  });

  describe("Evaluate PractitionerRoleReference", () => {
    it("should return the organization and practitioner when practitioner role is found ", () => {
      const actual = evaluatePractitionerRoleReference(
        BundlePractitionerRole as unknown as Bundle,
        "PractitionerRole/b18c20c1-123b-fd12-71cf-9dd0abae8ced",
      );

      expect(actual.organization).toEqual({
        id: "d319a926-0eb3-5847-3b21-db8b778b4f07",
        name: "Mos Eisley Medical Center",
        resourceType: "Organization",
      });

      expect(actual.practitioner).toEqual({
        id: "550b9626-bc9e-7d6b-c5d8-e41c2000ab85",
        name: [
          {
            family: "Interface",
          },
        ],
        resourceType: "Practitioner",
      });
    });
    it("should return undefined organization and practitioner when practitioner role is not found", () => {
      const actual = evaluatePractitionerRoleReference(
        BundlePractitionerRole as unknown as Bundle,
        "unknown",
      );

      expect(actual.organization).toBeUndefined();

      expect(actual.practitioner).toBeUndefined();
    });
  });

  describe("Evaluate Patient Address", () => {
    it("should return the 1 address", () => {
      const actual = evaluatePatientAddress(BundlePatient as unknown as Bundle);
      expect(actual).toEqual("1 Main St\nCloud City, CA\n00000, US");
    });
    it("should return all 3 of the addresses", () => {
      const actual = evaluatePatientAddress(
        BundlePatientMultiple as unknown as Bundle,
      );
      expect(actual).toEqual(
        "Home:\n" +
          "1 Mos Espa\n" +
          "Tatooine, CA\n" +
          "93523-2800, US\n" +
          "\n" +
          "Vacation:\n" +
          "10 Canyon Valley\n" +
          "Ben's Mesa, TN\n" +
          "00047, America\n" +
          "\n" +
          "Work:\n" +
          "1 Main St\n" +
          "Death Star, AZ\n" +
          "00001, USA",
      );
    });
  });

  describe("Evaluate Patient Name", () => {
    it("should return the 1 name", () => {
      const actual = evaluatePatientName(
        BundlePatient as unknown as Bundle,
        false,
      );
      expect(actual).toEqual("Han Solo");
    });
    it("should return all 2 of the names", () => {
      const actual = evaluatePatientName(
        BundlePatientMultiple as unknown as Bundle,
        false,
      );
      expect(actual).toEqual(
        "Official: Anakin Skywalker\n" + "Nickname: Darth Vader",
      );
    });
    it("should only return the official name for the banner", () => {
      const actual = evaluatePatientName(
        BundlePatientMultiple as unknown as Bundle,
        true,
      );
      expect(actual).toEqual("Anakin Skywalker");
    });
    it("should only return the official name for the banner", () => {
      const actual = evaluatePatientName(
        BundlePatient as unknown as Bundle,
        true,
      );
      expect(actual).toEqual("Han Solo");
    });
  });

  describe("Evaluate Alcohol Use", () => {
    it("should return the use, intake comment", () => {
      const actual = evaluateAlcoholUse(BundlePatient as unknown as Bundle);
      expect(actual).toEqual(
        "Use: Current drinker of alcohol (finding)\n" +
          "Intake (standard drinks/week): .29/d\n" +
          "Comment: 1-2 drinks 2 to 4 times a month",
      );
    });
    it("should empty string because there is no use, intake, or comment", () => {
      const actual = evaluateAlcoholUse(
        BundlePatientMultiple as unknown as Bundle,
      );
      expect(actual).toEqual("");
    });
  });

  describe("Evaluate Patient Vital Status", () => {
    function getPatientBundle(deceased: boolean) {
      return {
        resourceType: "Bundle",
        entry: [
          {
            resource: {
              resourceType: "Patient",
              deceasedBoolean: deceased,
            },
          },
        ],
      };
    }

    it("should return an empty string when no `deceasedBoolean` value is present", () => {
      const actual = evaluatePatientVitalStatus(
        BundlePatient as unknown as Bundle,
      );
      expect(actual).toEqual("");
    });

    it("should return `Alive` when `deceasedBoolean` is `false`", () => {
      const actual = evaluatePatientVitalStatus(
        getPatientBundle(false) as unknown as Bundle,
      );
      expect(actual).toEqual("Alive");
    });

    it("should return `Deceased` when `deceasedBoolean` is `true`", () => {
      const actual = evaluatePatientVitalStatus(
        getPatientBundle(true) as unknown as Bundle,
      );
      expect(actual).toEqual("Deceased");
    });
  });

  describe("Evaluate Patient language", () => {
    it("Should display language, proficiency, and mode", () => {
      const actual = evaluatePatientLanguage(
        BundlePatient as unknown as Bundle,
      );

      expect(actual).toEqual("English\nGood\nExpressed spoken");
    });

    it("Should only display preferred languages", () => {
      const patient = {
        resourceType: "Bundle",
        entry: [
          {
            resource: {
              resourceType: "Patient",
              communication: [
                {
                  language: {
                    coding: [
                      {
                        system: "urn:ietf:bcp:47",
                        code: "es",
                        display: "Spanish",
                      },
                    ],
                  },
                },
                {
                  preferred: true,
                  language: {
                    coding: [
                      {
                        system: "urn:ietf:bcp:47",
                        code: "en",
                        display: "English",
                      },
                    ],
                  },
                },
                {
                  preferred: true,
                  language: {
                    coding: [
                      {
                        system: "urn:ietf:bcp:47",
                        code: "hi",
                        display: "Hindi",
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      };

      const actual = evaluatePatientLanguage(patient as unknown as Bundle);

      expect(actual).toEqual("English\n\nHindi");
    });
    it("Should display language when there are no preferred languages", () => {
      const patient = {
        resourceType: "Bundle",
        entry: [
          {
            resource: {
              resourceType: "Patient",
              communication: [
                {
                  language: {
                    coding: [
                      {
                        system: "urn:ietf:bcp:47",
                        code: "es",
                        display: "Spanish",
                      },
                    ],
                  },
                },
                {
                  language: {
                    coding: [
                      {
                        system: "urn:ietf:bcp:47",
                        code: "en",
                        display: "English",
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      };

      const actual = evaluatePatientLanguage(patient as unknown as Bundle);

      expect(actual).toEqual("Spanish\n\nEnglish");
    });
  });

  describe("Censor Gender", () => {
    it("should return the string if 'Male' or 'Female'", () => {
      const expected = "Male";
      const actual = censorGender(expected);
      expect(actual).toEqual(expected);
    });

    it("should return an empty string if 'Other'", () => {
      const expected = "Other";
      const actual = censorGender(expected);
      expect(actual).toEqual("");
    });
  });
});
