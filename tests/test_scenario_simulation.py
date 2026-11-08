import pytest

from cycleflow.scenario import simulate_inventory


@pytest.mark.parametrize("size", [2, 4, 6, 9, 12])
def test_inventory_and_flow_conservation(size):
    result = simulate_inventory(4, 10, [8] * size, [20] * size,
                                demand_pct=-50, return_pct=100, supply_bikes=100)
    assert result["applied_supply"] == 6
    assert len(result["steps"]) == size
    previous = result["initial_bikes"]
    for i, step in enumerate(result["steps"], 1):
        assert step["minute"] == i * 5
        assert step["start_bikes"] == previous
        assert step["bikes"] == previous + step["accepted_returns"] - step["accepted_hires"]
        assert 0 <= step["bikes"] <= 10
        assert step["accepted_returns"] + step["unmet_returns"] == 40
        assert step["accepted_hires"] + step["unmet_hires"] == 4
        previous = step["bikes"]
    assert result["steps"][0]["unmet_returns"] == 40


def test_zero_inventory_and_invalid_inputs():
    result = simulate_inventory(4, 10, [8, 20], [0, 20], supply_bikes=-100)
    assert result["applied_supply"] == -4
    assert result["steps"][0]["unmet_hires"] == 8
    assert result["steps"][1]["unmet_returns"] == 10
    with pytest.raises(ValueError):
        simulate_inventory(4, 10, [8, -20], [2, 20], demand_pct=-100)
    with pytest.raises(ValueError):
        simulate_inventory(11, 10, [8, 20], [2, 20])
