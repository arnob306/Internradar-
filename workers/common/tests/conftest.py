import pytest
from internradar_common.testing import FakeSleeper, ManualClock


@pytest.fixture
def clock() -> ManualClock:
    return ManualClock()


@pytest.fixture
def sleeper(clock: ManualClock) -> FakeSleeper:
    return FakeSleeper(clock)
