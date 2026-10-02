"""One fetch per URL per Melbourne day (ADR-015).

A claim is taken before fetching. The first claim for a (URL, day) wins and every later
one is refused, so a retried or overlapping job cannot fetch the same page twice in a day.
The URL is normalised so trivial spellings of the same page share one claim.
"""

from datetime import date

from internradar_common.claims import InMemoryClaimStore

DAY = date(2026, 10, 1)
URL = "https://careers.example.com/graduates"


def test_the_first_claim_wins_and_the_second_is_refused() -> None:
    store = InMemoryClaimStore()

    assert store.claim(URL, DAY) is True
    assert store.claim(URL, DAY) is False


def test_the_same_url_can_be_claimed_again_on_the_next_day() -> None:
    store = InMemoryClaimStore()
    store.claim(URL, DAY)

    assert store.claim(URL, date(2026, 10, 2)) is True


def test_different_urls_are_claimed_independently() -> None:
    store = InMemoryClaimStore()
    store.claim(URL, DAY)

    assert store.claim("https://careers.example.com/internships", DAY) is True


def test_the_fragment_and_host_case_do_not_make_a_new_claim() -> None:
    store = InMemoryClaimStore()
    store.claim(URL, DAY)

    assert store.claim(f"{URL}#apply", DAY) is False
    assert store.claim("https://CAREERS.example.com/graduates", DAY) is False


def test_the_query_string_does_make_a_different_page() -> None:
    store = InMemoryClaimStore()
    store.claim(URL, DAY)

    assert store.claim(f"{URL}?team=tech", DAY) is True


def test_separate_stores_do_not_share_claims() -> None:
    InMemoryClaimStore().claim(URL, DAY)

    assert InMemoryClaimStore().claim(URL, DAY) is True
