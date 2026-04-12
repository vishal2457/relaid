package relay

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

const (
	eioOpen    = '0'
	eioClose   = '1'
	eioPing    = '2'
	eioPong    = '3'
	eioMessage = '4'
	eioUpgrade = '5'
	eioNoop    = '6'

	sioConnect      = '0'
	sioDisconnect   = '1'
	sioEvent        = '2'
	sioAck          = '3'
	sioConnectError = '4'
	sioBinaryEvent  = '5'
	sioBinaryAck    = '6'
)

type EIOPacket struct {
	Type byte
	Data string
}

func EncodeEIO(pkt EIOPacket) string {
	return fmt.Sprintf("%c%s", pkt.Type, pkt.Data)
}

func DecodeEIO(raw string) (EIOPacket, error) {
	if len(raw) == 0 {
		return EIOPacket{}, fmt.Errorf("empty packet")
	}
	return EIOPacket{Type: raw[0], Data: raw[1:]}, nil
}

type SIOPacket struct {
	Type  byte
	NSP   string
	Data  json.RawMessage
	AckID *int
}

func EncodeSIO(pkt SIOPacket) string {
	var b strings.Builder
	b.WriteByte(pkt.Type)

	if pkt.NSP != "" && pkt.NSP != "/" {
		b.WriteString(pkt.NSP)
		b.WriteByte(',')
	}

	if pkt.AckID != nil {
		b.WriteString(strconv.Itoa(*pkt.AckID))
	}

	data := strings.TrimRight(string(pkt.Data), " \n")
	if data != "" {
		b.WriteString(data)
	}

	return b.String()
}

func DecodeSIO(raw string) (SIOPacket, error) {
	pkt := SIOPacket{}
	if len(raw) == 0 {
		return pkt, fmt.Errorf("empty sio packet")
	}
	pkt.Type = raw[0]

	rest := raw[1:]

	idx := strings.Index(rest, "[")
	if idx == -1 {
		pkt.NSP = "/"
		pkt.Data = json.RawMessage("")
		return pkt, nil
	}

	path := rest[:idx]
	if path == "" || path == "/" {
		pkt.NSP = "/"
	} else {
		pkt.NSP = path
	}

	dataStr := rest[idx:]
	pkt.Data = json.RawMessage(dataStr)

	return pkt, nil
}

func EncodeEIOOpen(data string) string {
	return EncodeEIO(EIOPacket{Type: eioOpen, Data: data})
}

func EncodeSIOMessage(sio SIOPacket) string {
	return EncodeEIO(EIOPacket{Type: eioMessage, Data: EncodeSIO(sio)})
}

func EncodeSIOConnect(auth interface{}) string {
	authBytes, _ := json.Marshal(auth)
	sio := SIOPacket{
		Type: sioConnect,
		NSP:  "/",
		Data: authBytes,
	}
	return EncodeSIOMessage(sio)
}

func EncodeSIOEvent(event string, args ...interface{}) string {
	data, _ := json.Marshal(append([]interface{}{event}, args...))
	sio := SIOPacket{
		Type: sioEvent,
		NSP:  "/",
		Data: data,
	}
	return EncodeSIOMessage(sio)
}

func DecodeSIOEvent(raw string) (event string, args []json.RawMessage, err error) {
	eioPkt, err := DecodeEIO(raw)
	if err != nil {
		return "", nil, err
	}

	if eioPkt.Type != eioMessage {
		return "", nil, fmt.Errorf("expected message packet, got type %c", eioPkt.Type)
	}

	sioPkt, err := DecodeSIO(eioPkt.Data)
	if err != nil {
		return "", nil, err
	}

	if sioPkt.Type != sioEvent {
		return "", nil, fmt.Errorf("expected event packet, got type %c", sioPkt.Type)
	}

	var arr []json.RawMessage
	if err := json.Unmarshal(sioPkt.Data, &arr); err != nil {
		return "", nil, err
	}

	if len(arr) == 0 {
		return "", nil, fmt.Errorf("empty event data")
	}

	if err := json.Unmarshal(arr[0], &event); err != nil {
		return "", nil, err
	}

	return event, arr[1:], nil
}

func DecodeSIOConnect(raw string) (map[string]interface{}, error) {
	eioPkt, err := DecodeEIO(raw)
	if err != nil {
		return nil, err
	}

	if eioPkt.Type != eioMessage {
		return nil, fmt.Errorf("expected message packet, got type %c", eioPkt.Type)
	}

	sioPkt, err := DecodeSIO(eioPkt.Data)
	if err != nil {
		return nil, err
	}

	if sioPkt.Type != sioConnect {
		return nil, fmt.Errorf("expected connect packet, got type %c", sioPkt.Type)
	}

	var result map[string]interface{}
	if len(sioPkt.Data) > 0 {
		if err := json.Unmarshal(sioPkt.Data, &result); err != nil {
			return nil, err
		}
	}

	return result, nil
}
