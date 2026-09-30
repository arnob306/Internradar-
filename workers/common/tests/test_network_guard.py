import socket

import pytest
from pytest_socket import SocketBlockedError


def test_opening_a_real_network_socket_fails() -> None:
    with pytest.raises(SocketBlockedError):
        socket.create_connection(("example.invalid", 80), timeout=1)


def test_creating_a_tcp_socket_fails() -> None:
    # `with` closes the socket if the guard ever stops blocking it.
    with (
        pytest.raises(SocketBlockedError),
        socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock,
    ):
        sock.connect(("127.0.0.1", 9))
