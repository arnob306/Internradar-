import internradar_monitor


def test_monitor_package_is_discovered_and_importable() -> None:
    assert internradar_monitor.__name__ == "internradar_monitor"
