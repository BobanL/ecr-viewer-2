from pathlib import Path

import httpx
import pytest
from syrupy.matchers import path_type

CONVERTER_URL = "http://localhost:8080"
CONVERT_TO_FHIR = CONVERTER_URL + "/convert-to-fhir"


# Ignore all non-mutable fields in a FHIR bundle:
# ids, references, etc, will not be evaluated in snapshot testing.
ignore_mutable_fields_regex_mapping = {
    ".*id": (str,),
    ".*fullUrl": (str,),
    ".*url": (str,),
    ".*div": (str,),
    ".*reference": (str,),
}
match_excluding_mutable_fields = path_type(
    mapping=ignore_mutable_fields_regex_mapping, regex=True
)


@pytest.mark.integration
def test_health_check(setup):
    health_check_response = httpx.get(CONVERTER_URL)
    assert health_check_response.status_code == 200


@pytest.mark.integration
def test_openapi():
    actual_response = httpx.get(CONVERTER_URL + "/fhir-converter/openapi.json")
    assert actual_response.status_code == 200


@pytest.mark.integration
def test_vxu_conversion(setup, snapshot):
    input_data = open(
        Path(__file__).parent.parent.parent / "assets" / "sample_request.hl7"
    ).read()
    request = {
        "input_data": input_data,
        "input_type": "vxu",
        "root_template": "VXU_V04",
    }
    vxu_conversion_response = httpx.post(CONVERT_TO_FHIR, json=request)

    assert vxu_conversion_response.status_code == 200
    assert vxu_conversion_response.json()["response"] == snapshot(
        matcher=match_excluding_mutable_fields
    )


@pytest.mark.integration
def test_ecr_conversion(setup, snapshot):
    input_data = open(
        Path(__file__).parent.parent.parent.parent.parent
        / "tests"
        / "assets"
        / "fhir-converter"
        / "ccda"
        / "ccda_sample.xml"
    ).read()
    request = {"input_data": input_data, "input_type": "ecr", "root_template": "EICR"}
    ecr_conversion_response = httpx.post(CONVERT_TO_FHIR, json=request)
    assert ecr_conversion_response.status_code == 200
    assert ecr_conversion_response.json()["response"] == snapshot(
        matcher=match_excluding_mutable_fields
    )


@pytest.mark.integration
def test_invalid_rr_format(setup):
    request = {
        "input_data": "not valid xml",
        "input_type": "ecr",
        "root_template": "EICR",
        "rr_data": "also not valid xml",
    }
    ecr_conversion_response = httpx.post(CONVERT_TO_FHIR, json=request)

    assert ecr_conversion_response.status_code == 422
    assert (
        ecr_conversion_response.json()["detail"]
        == "Reportability Response and eICR message both "
        "must be valid XML messages."
    )
