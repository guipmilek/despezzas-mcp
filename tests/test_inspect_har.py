from scripts.inspect_har import summarize


def test_har_summary_filters_hosts_and_masks_headers():
    ignored = {"request": {"url": "https://example.com/v1/data"}}
    assert summarize(ignored) is None

    item = summarize(
        {
            "request": {
                "method": "GET",
                "url": "https://api.despezzas.com/v1/profile?token=secret&safe=yes",
                "headers": [
                    {"name": "Authorization", "value": "Bearer secret"},
                    {"name": "Accept", "value": "application/json"},
                ],
            },
            "response": {"status": 200},
        }
    )
    assert item["query"]["token"] == "[mascarado]"
    assert item["headers"]["Authorization"] == "[mascarado]"
    assert item["headers"]["Accept"] == "application/json"
