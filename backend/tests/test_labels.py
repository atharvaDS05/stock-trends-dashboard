"""
Day 3, Task 2 — Label output validation tests.

Verifies:
  1. labels[] length == data[] length (alignment)
  2. First 19 entries are None (MA20 warm-up period)
  3. All entries from index 19 onward are "invest" or "no-invest" (no other values)
  4. Close > MA20  => label == "invest"
     Close <= MA20 => label == "no-invest"
     (spot-checked across every labeled row using the raw data)
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pandas as pd
from server.main import _compute_labels


def _make_df(closes: list) -> pd.DataFrame:
    """Build a minimal DataFrame with a Close column."""
    return pd.DataFrame({"Close": closes})


# ---------------------------------------------------------------------------
# Test 1: length alignment
# ---------------------------------------------------------------------------
def test_labels_length_matches_data():
    closes = [100.0 + i for i in range(60)]
    df = _make_df(closes)
    labels = _compute_labels(df)
    assert len(labels) == len(closes), (
        f"labels length {len(labels)} != data length {len(closes)}"
    )
    print("PASS  test_labels_length_matches_data")


# ---------------------------------------------------------------------------
# Test 2: warm-up period — first 19 rows must be None
# ---------------------------------------------------------------------------
def test_warmup_rows_are_none():
    closes = [float(i + 1) for i in range(60)]
    df = _make_df(closes)
    labels = _compute_labels(df)
    for i in range(19):
        assert labels[i] is None, (
            f"Row {i} should be None during MA20 warm-up, got '{labels[i]}'"
        )
    # Row 19 (index 19, the 20th row) must not be None
    assert labels[19] is not None, "Row 19 should have a label (MA20 is available)"
    print("PASS  test_warmup_rows_are_none")


# ---------------------------------------------------------------------------
# Test 3: labeled rows only contain valid values
# ---------------------------------------------------------------------------
def test_valid_label_values():
    closes = [float(i + 1) for i in range(60)]
    df = _make_df(closes)
    labels = _compute_labels(df)
    valid = {"invest", "no-invest", None}
    for i, lbl in enumerate(labels):
        assert lbl in valid, f"Row {i}: unexpected label value '{lbl}'"
    print("PASS  test_valid_label_values")


# ---------------------------------------------------------------------------
# Test 4: logic correctness — Close > MA20 => invest, else no-invest
# ---------------------------------------------------------------------------
def test_label_logic_correctness():
    closes = [float(i + 1) for i in range(60)]
    df = _make_df(closes)
    labels = _compute_labels(df)

    close_series = df["Close"].astype(float)
    ma20_series  = close_series.rolling(20).mean()

    mismatches = []
    for i, (c, m, lbl) in enumerate(zip(close_series, ma20_series, labels)):
        if lbl is None:
            continue
        expected = "invest" if c > m else "no-invest"
        if lbl != expected:
            mismatches.append(
                f"  row {i}: close={c:.4f}, ma20={m:.4f}, "
                f"expected='{expected}', got='{lbl}'"
            )

    assert not mismatches, "Label logic mismatches:\n" + "\n".join(mismatches)
    print("PASS  test_label_logic_correctness")


# ---------------------------------------------------------------------------
# Test 5: explicit invest case — close well above MA20
# ---------------------------------------------------------------------------
def test_explicit_invest_case():
    # Flat then spike: last row close >> MA20
    closes = [100.0] * 19 + [200.0]   # 20 rows; MA20 of last row = (19*100+200)/20 = 104.75
    df = _make_df(closes)
    labels = _compute_labels(df)
    assert labels[19] == "invest", (
        f"Expected 'invest' when close (200) > MA20 (~104.75), got '{labels[19]}'"
    )
    print("PASS  test_explicit_invest_case")


# ---------------------------------------------------------------------------
# Test 6: explicit no-invest case — close below MA20
# ---------------------------------------------------------------------------
def test_explicit_no_invest_case():
    # Flat then drop: last row close << MA20
    closes = [100.0] * 19 + [50.0]    # MA20 of last row = (19*100+50)/20 = 97.5
    df = _make_df(closes)
    labels = _compute_labels(df)
    assert labels[19] == "no-invest", (
        f"Expected 'no-invest' when close (50) < MA20 (~97.5), got '{labels[19]}'"
    )
    print("PASS  test_explicit_no_invest_case")


# ---------------------------------------------------------------------------
# Test 7: exactly at MA20 (equal) => no-invest  (strictly greater required)
# ---------------------------------------------------------------------------
def test_equal_close_ma20_is_no_invest():
    # All identical values — close == MA20 always
    closes = [100.0] * 40
    df = _make_df(closes)
    labels = _compute_labels(df)
    for i in range(19, 40):
        assert labels[i] == "no-invest", (
            f"Row {i}: close == MA20 should be 'no-invest', got '{labels[i]}'"
        )
    print("PASS  test_equal_close_ma20_is_no_invest")


# ---------------------------------------------------------------------------
# Test 8: empty DataFrame returns empty list
# ---------------------------------------------------------------------------
def test_empty_dataframe():
    df = _make_df([])
    labels = _compute_labels(df)
    assert labels == [], f"Expected [] for empty df, got {labels}"
    print("PASS  test_empty_dataframe")


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    tests = [
        test_labels_length_matches_data,
        test_warmup_rows_are_none,
        test_valid_label_values,
        test_label_logic_correctness,
        test_explicit_invest_case,
        test_explicit_no_invest_case,
        test_equal_close_ma20_is_no_invest,
        test_empty_dataframe,
    ]
    failed = 0
    for t in tests:
        try:
            t()
        except AssertionError as e:
            print(f"FAIL  {t.__name__}: {e}")
            failed += 1
        except Exception as e:
            print(f"ERROR {t.__name__}: {e}")
            failed += 1

    print(f"\n{'All tests passed.' if not failed else f'{failed} test(s) failed.'}")
    sys.exit(0 if not failed else 1)
