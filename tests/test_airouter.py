"""Focused tests: these reuse the selftest checks so both stay in sync."""
from airouter import selftest
from airouter.server import build_context


def test_router_routes_samples():
    selftest.check_router()


def test_provider_interface():
    selftest.check_provider_interface()


def test_unconfigured_providers_never_answer():
    selftest.check_unconfigured_is_honest()


def test_history_resume_and_model_switch(tmp_path):
    selftest.check_history_and_switching(tmp_path)


def test_context_merges_back_to_back_turns():
    hist = [{"role": "user", "content": "a"}, {"role": "user", "content": "b"},
            {"role": "assistant", "content": ""}, {"role": "assistant", "content": "c"}]
    assert build_context(hist) == [{"role": "user", "content": "a\n\nb"},
                                   {"role": "assistant", "content": "c"}]
