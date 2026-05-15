package relay

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"

	"golang.org/x/crypto/nacl/box"
	"relaid/internal/secrets"
)

const (
	e2eePublicKeyKey  = "relay_e2ee_public_key"
	e2eePrivateKeyKey = "relay_e2ee_private_key"
)

type E2EEKeyMaterial struct {
	PublicKey   string `json:"publicKey"`
	PrivateKey  string `json:"privateKey"`
	KeyID       string `json:"keyId"`
	Fingerprint string `json:"fingerprint"`
}

type EncryptedEnvelope struct {
	Version           string `json:"version"`
	SenderDeviceID    string `json:"senderDeviceId,omitempty"`
	RecipientServerID string `json:"recipientServerId,omitempty"`
	Nonce             string `json:"nonce"`
	Ciphertext        string `json:"ciphertext"`
}

func LoadOrCreateE2EEKeyMaterial() (*E2EEKeyMaterial, error) {
	keychain := secrets.New()
	publicKey, pubErr := keychain.Get(e2eePublicKeyKey)
	privateKey, privErr := keychain.Get(e2eePrivateKeyKey)
	if pubErr == nil && privErr == nil && publicKey != "" && privateKey != "" {
		return hydrateKeyMaterial(publicKey, privateKey)
	}

	pub, priv, err := box.GenerateKey(rand.Reader)
	if err != nil {
		return nil, fmt.Errorf("generate e2ee keypair: %w", err)
	}

	publicKey = base64.StdEncoding.EncodeToString(pub[:])
	privateKey = base64.StdEncoding.EncodeToString(priv[:])

	if err := keychain.Set(e2eePublicKeyKey, publicKey); err != nil {
		return nil, err
	}
	if err := keychain.Set(e2eePrivateKeyKey, privateKey); err != nil {
		return nil, err
	}

	return hydrateKeyMaterial(publicKey, privateKey)
}

func hydrateKeyMaterial(publicKey string, privateKey string) (*E2EEKeyMaterial, error) {
	publicKeyBytes, err := decodeKey(publicKey, 32)
	if err != nil {
		return nil, err
	}
	if _, err := decodeKey(privateKey, 32); err != nil {
		return nil, err
	}
	sum := sha256.Sum256(publicKeyBytes)
	keyID := hex.EncodeToString(sum[:8])
	fingerprint := hex.EncodeToString(sum[:6])
	return &E2EEKeyMaterial{
		PublicKey:   publicKey,
		PrivateKey:  privateKey,
		KeyID:       keyID,
		Fingerprint: fingerprint,
	}, nil
}

func decodeKey(value string, expectedLen int) ([]byte, error) {
	decoded, err := base64.StdEncoding.DecodeString(value)
	if err != nil {
		return nil, fmt.Errorf("decode key: %w", err)
	}
	if len(decoded) != expectedLen {
		return nil, fmt.Errorf("invalid key length: %d", len(decoded))
	}
	return decoded, nil
}

func EncryptEnvelope(payload any, senderDeviceID string, recipientServerID string, recipientPublicKeyBase64 string, privateKeyBase64 string) (*EncryptedEnvelope, error) {
	recipientPublicKey, err := decodeKey(recipientPublicKeyBase64, 32)
	if err != nil {
		return nil, err
	}
	privateKey, err := decodeKey(privateKeyBase64, 32)
	if err != nil {
		return nil, err
	}

	message, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal payload: %w", err)
	}

	var nonce [24]byte
	if _, err := rand.Read(nonce[:]); err != nil {
		return nil, fmt.Errorf("generate nonce: %w", err)
	}

	var recipientKey [32]byte
	copy(recipientKey[:], recipientPublicKey)
	var privateKeyArr [32]byte
	copy(privateKeyArr[:], privateKey)

	encrypted := box.Seal(nil, message, &nonce, &recipientKey, &privateKeyArr)
	return &EncryptedEnvelope{
		Version:           "v1",
		SenderDeviceID:    senderDeviceID,
		RecipientServerID: recipientServerID,
		Nonce:             base64.StdEncoding.EncodeToString(nonce[:]),
		Ciphertext:        base64.StdEncoding.EncodeToString(encrypted),
	}, nil
}

func DecryptEnvelope[T any](envelope EncryptedEnvelope, senderPublicKeyBase64 string, privateKeyBase64 string) (T, error) {
	var zero T
	senderPublicKey, err := decodeKey(senderPublicKeyBase64, 32)
	if err != nil {
		return zero, err
	}
	privateKey, err := decodeKey(privateKeyBase64, 32)
	if err != nil {
		return zero, err
	}
	nonceBytes, err := base64.StdEncoding.DecodeString(envelope.Nonce)
	if err != nil {
		return zero, fmt.Errorf("decode nonce: %w", err)
	}
	if len(nonceBytes) != 24 {
		return zero, fmt.Errorf("invalid nonce length: %d", len(nonceBytes))
	}
	ciphertext, err := base64.StdEncoding.DecodeString(envelope.Ciphertext)
	if err != nil {
		return zero, fmt.Errorf("decode ciphertext: %w", err)
	}

	var nonce [24]byte
	copy(nonce[:], nonceBytes)
	var senderKey [32]byte
	copy(senderKey[:], senderPublicKey)
	var privateKeyArr [32]byte
	copy(privateKeyArr[:], privateKey)

	opened, ok := box.Open(nil, ciphertext, &nonce, &senderKey, &privateKeyArr)
	if !ok {
		return zero, fmt.Errorf("decrypt envelope failed")
	}

	var parsed T
	if err := json.Unmarshal(opened, &parsed); err != nil {
		return zero, fmt.Errorf("unmarshal decrypted payload: %w", err)
	}
	return parsed, nil
}
