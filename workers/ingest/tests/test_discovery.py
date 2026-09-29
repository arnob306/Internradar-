import internradar_ingest


def test_ingest_package_is_discovered_and_importable() -> None:
    assert internradar_ingest.__name__ == "internradar_ingest"
